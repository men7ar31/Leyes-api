import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { env } from '../../config/env';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { saijProxyPool, SaijProxySelection } from './saijProxyPool';

const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent as new (proxy: string) => any;

type SaijRequestOptions = {
  requestName: 'search' | 'view-document' | 'friendly-url';
  accept?: string;
  responseType?: AxiosRequestConfig['responseType'];
  timeoutMs?: number;
  retry403?: boolean;
};

type SaijRequestResult = {
  response: AxiosResponse;
  retryUsed: boolean;
};

type SessionContext = {
  key: string;
  jar: CookieJar;
  http: AxiosInstance;
  sessionReady: boolean;
  sessionInitInFlight: Promise<void> | null;
  proxy: SaijProxySelection | null;
};

const DEFAULT_TIMEOUT_MS = 15000;
const SAIJ_HOME_URL = 'https://www.saij.gob.ar/';
const HTML_ERROR_PREVIEW_LIMIT = 300;

const BASE_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9',
  Referer: SAIJ_HOME_URL,
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
};

const errorPreviewFrom = (data: unknown): string | undefined => {
  if (typeof data !== 'string') return undefined;
  const normalized = data.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, HTML_ERROR_PREVIEW_LIMIT);
};

const isTimeoutError = (error: unknown): boolean => {
  return error instanceof AxiosError && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const extractStatusFromError = (error: unknown): number | undefined => {
  const err = error as any;
  const status = err?.statusCode ?? err?.status ?? err?.details?.status ?? err?.response?.status;
  const parsed = Number(status);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractErrorCode = (error: unknown): string | undefined => {
  const err = error as any;
  const code = err?.code || err?.error || err?.response?.data?.error;
  return code ? String(code) : undefined;
};

const isProxyRetryableError = (error: unknown): boolean => {
  const status = extractStatusFromError(error);
  if (status === 403) return true;
  const code = String(extractErrorCode(error) || '').toUpperCase();
  if (
    code === 'SAIJ_SESSION_INIT_FAILED' ||
    code === 'SAIJ_TIMEOUT' ||
    code === 'SAIJ_ERROR' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED'
  ) {
    return true;
  }
  if (error instanceof AxiosError) {
    const axiosCode = String(error.code || '').toUpperCase();
    return axiosCode === 'ECONNABORTED' || axiosCode === 'ETIMEDOUT' || axiosCode === 'ECONNRESET' || axiosCode === 'ECONNREFUSED';
  }
  return false;
};

const getRetryReason = (error: unknown): string => {
  const status = extractStatusFromError(error);
  if (status === 403) return 'forbidden';
  const code = String(extractErrorCode(error) || '').toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'SAIJ_TIMEOUT') return 'timeout';
  if (code === 'ECONNRESET') return 'econnreset';
  if (code === 'ECONNREFUSED') return 'econnrefused';
  if (code) return code.toLowerCase();
  return 'unknown';
};

const getProxyBlockedUntil = (proxyId: string): string | null => {
  const stats = saijProxyPool.getSanitizedStats();
  const proxy = stats.proxies.find((item) => item.proxyId === proxyId);
  return proxy?.blockedUntil ?? null;
};

export class SaijHttpClient {
  private readonly sessions = new Map<string, SessionContext>();

  async get(url: string, options: SaijRequestOptions): Promise<SaijRequestResult> {
    const useProxy = saijProxyPool.isEnabled();

    if (!useProxy) {
      return await this.executeDirect(url, options);
    }

    saijProxyPool.assertReady();

    const maxAttempts = Math.max(1, saijProxyPool.getMaxAttempts());
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const proxy = saijProxyPool.acquireProxy();
      const context = this.getOrCreateSession(proxy);

      logger.info(
        {
          requestName: options.requestName,
          proxyEnabled: true,
          proxyId: proxy.proxyId,
          proxyHost: proxy.host,
          attempt,
          url,
        },
        'SAIJ proxy request attempt'
      );

      try {
        await this.ensureSession(context, { requestName: options.requestName, attempt, url });

        const response = await context.http.get(url, {
          validateStatus: () => true,
          timeout: options.timeoutMs ?? env.saijProxyTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          responseType: options.responseType,
          headers: {
            Accept: options.accept ?? BASE_BROWSER_HEADERS.Accept,
          },
          transformResponse:
            options.responseType === 'text'
              ? [(raw) => raw]
              : undefined,
        });

        const contentType = String(response.headers['content-type'] ?? '');
        const effectiveUrl = this.resolveResponseUrl(response, url);

        logger.info(
          {
            requestName: options.requestName,
            proxyEnabled: true,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
            attempt,
            url: effectiveUrl,
            status: response.status,
            contentType,
          },
          'SAIJ HTTP response'
        );

        if (response.status === 403) {
          saijProxyPool.markFailure(proxy.proxyId, {
            status: response.status,
            errorCode: '403',
            message: 'forbidden',
          });

          await this.resetSession(context, 'proxy_403_response');

          logger.warn(
            {
              requestName: options.requestName,
              proxyEnabled: true,
              proxyId: proxy.proxyId,
              proxyHost: proxy.host,
              attempt,
              status: response.status,
              retryReason: 'forbidden',
              proxyBlockedUntil: getProxyBlockedUntil(proxy.proxyId),
            },
            'SAIJ proxy received 403'
          );

          lastError = new HttpError(503, 'saij_proxy_request_failed', 'SAIJ request blocked on proxy', {
            status: response.status,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
          });

          continue;
        }

        saijProxyPool.markSuccess(proxy.proxyId);
        return { response, retryUsed: attempt > 1 };
      } catch (error) {
        lastError = error;

        const retryReason = getRetryReason(error);
        saijProxyPool.markFailure(proxy.proxyId, {
          status: extractStatusFromError(error),
          errorCode: extractErrorCode(error),
          message: (error as any)?.message,
        });

        await this.resetSession(context, `proxy_error_${retryReason}`);

        logger.warn(
          {
            requestName: options.requestName,
            proxyEnabled: true,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
            attempt,
            url,
            status: extractStatusFromError(error),
            errorCode: extractErrorCode(error),
            retryReason,
            proxyBlockedUntil: getProxyBlockedUntil(proxy.proxyId),
          },
          'SAIJ proxy request failed'
        );

        if (!isProxyRetryableError(error)) {
          break;
        }
      }
    }

    if (lastError instanceof HttpError && lastError.code === 'saij_proxy_pool_empty') {
      throw lastError;
    }

    throw new HttpError(503, 'saij_proxy_pool_exhausted', 'No se pudo acceder a SAIJ usando los proxies configurados', {
      lastErrorCode: extractErrorCode(lastError),
      lastErrorStatus: extractStatusFromError(lastError),
      proxyEnabled: true,
    });
  }

  private async executeDirect(url: string, options: SaijRequestOptions): Promise<SaijRequestResult> {
    const context = this.getOrCreateSession(null);
    await this.ensureSession(context, { requestName: options.requestName, attempt: 1, url });

    const maxAttempts = options.retry403 ? 2 : 1;
    let retryUsed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await context.http.get(url, {
          validateStatus: () => true,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          responseType: options.responseType,
          headers: {
            Accept: options.accept ?? BASE_BROWSER_HEADERS.Accept,
          },
          transformResponse:
            options.responseType === 'text'
              ? [(raw) => raw]
              : undefined,
        });

        const contentType = String(response.headers['content-type'] ?? '');
        const effectiveUrl = this.resolveResponseUrl(response, url);
        logger.info(
          {
            requestName: options.requestName,
            proxyEnabled: false,
            url: effectiveUrl,
            status: response.status,
            contentType,
            retryUsed,
          },
          'SAIJ HTTP response'
        );

        if (response.status === 403 && options.retry403 && attempt < maxAttempts) {
          retryUsed = true;
          const preview = errorPreviewFrom(response.data);
          logger.warn(
            {
              requestName: options.requestName,
              proxyEnabled: false,
              url: effectiveUrl,
              status: response.status,
              contentType,
              retryUsed,
              htmlPreview: preview,
            },
            'SAIJ returned 403, resetting session and retrying once'
          );
          await this.resetSession(context, '403_retry');
          await this.ensureSession(context, { requestName: options.requestName, attempt: attempt + 1, url });
          continue;
        }

        return { response, retryUsed };
      } catch (error) {
        if (isTimeoutError(error)) {
          throw new HttpError(504, 'saij_timeout', 'SAIJ no respondio a tiempo');
        }

        logger.warn(
          {
            requestName: options.requestName,
            proxyEnabled: false,
            url,
            retryUsed,
            errorName: (error as any)?.name,
            errorMessage: (error as any)?.message,
          },
          'SAIJ network error'
        );

        throw new HttpError(502, 'saij_error', 'Fallo al consultar SAIJ', {
          message: (error as any)?.message,
        });
      }
    }

    throw new HttpError(502, 'saij_error', 'Fallo al consultar SAIJ');
  }

  private createHttpClient(jar: CookieJar, proxy: SaijProxySelection | null): AxiosInstance {
    if (proxy) {
      const proxyAgent = new HttpsProxyAgent(proxy.agentUrl);
      return wrapper(
        axios.create({
          baseURL: env.saijBaseUrl,
          timeout: env.saijProxyTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          withCredentials: true,
          jar,
          headers: BASE_BROWSER_HEADERS,
          proxy: false,
          httpAgent: proxyAgent,
          httpsAgent: proxyAgent,
        })
      );
    }

    return wrapper(
      axios.create({
        baseURL: env.saijBaseUrl,
        timeout: DEFAULT_TIMEOUT_MS,
        withCredentials: true,
        jar,
        headers: BASE_BROWSER_HEADERS,
      })
    );
  }

  private getOrCreateSession(proxy: SaijProxySelection | null): SessionContext {
    const key = proxy ? proxy.proxyId : 'direct';
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const jar = new CookieJar();
    const context: SessionContext = {
      key,
      jar,
      http: this.createHttpClient(jar, proxy),
      sessionReady: false,
      sessionInitInFlight: null,
      proxy,
    };
    this.sessions.set(key, context);
    return context;
  }

  private async ensureSession(
    context: SessionContext,
    metadata: { requestName: string; attempt: number; url: string }
  ): Promise<void> {
    if (context.sessionReady) {
      return;
    }

    if (context.sessionInitInFlight) {
      await context.sessionInitInFlight;
      return;
    }

    context.sessionInitInFlight = this.bootstrapSession(context, metadata);
    try {
      await context.sessionInitInFlight;
    } finally {
      context.sessionInitInFlight = null;
    }
  }

  private async bootstrapSession(
    context: SessionContext,
    metadata: { requestName: string; attempt: number; url: string }
  ): Promise<void> {
    const homeResponse = await context.http.get('/', {
      validateStatus: () => true,
      timeout: context.proxy ? env.saijProxyTimeoutMs : DEFAULT_TIMEOUT_MS,
      responseType: 'text',
      transformResponse: [(raw) => raw],
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = String(homeResponse.headers['content-type'] ?? '');
    const preview = errorPreviewFrom(homeResponse.data);
    const resolvedUrl = this.resolveResponseUrl(homeResponse, '/');

    logger.info(
      {
        requestName: 'session-init',
        proxyEnabled: Boolean(context.proxy),
        proxyId: context.proxy?.proxyId ?? null,
        proxyHost: context.proxy?.host ?? null,
        attempt: metadata.attempt,
        url: resolvedUrl,
        status: homeResponse.status,
        contentType,
      },
      'SAIJ session bootstrap response'
    );

    if (homeResponse.status >= 400) {
      throw new HttpError(502, 'saij_session_init_failed', 'No se pudo iniciar sesion con SAIJ', {
        status: homeResponse.status,
        contentType,
        htmlPreview: preview,
        proxyEnabled: Boolean(context.proxy),
        proxyId: context.proxy?.proxyId ?? null,
        proxyHost: context.proxy?.host ?? null,
      });
    }

    context.sessionReady = true;
  }

  private async resetSession(context: SessionContext, reason: string): Promise<void> {
    context.jar = new CookieJar();
    context.http = this.createHttpClient(context.jar, context.proxy);
    context.sessionReady = false;

    logger.warn(
      {
        reason,
        proxyEnabled: Boolean(context.proxy),
        proxyId: context.proxy?.proxyId ?? null,
        proxyHost: context.proxy?.host ?? null,
      },
      'SAIJ session reset'
    );
  }

  private resolveResponseUrl(response: AxiosResponse, requestUrl: string): string {
    const direct = response.request?.res?.responseUrl;
    if (typeof direct === 'string' && direct.length > 0) return direct;
    if (isAbsoluteUrl(requestUrl)) return requestUrl;
    return `${env.saijBaseUrl}${requestUrl}`;
  }
}

export const saijHttpClient = new SaijHttpClient();
