import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
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
  lastBootstrapStatus: number | null;
  lastBootstrapCookiesReceived: boolean;
};

const DEFAULT_TIMEOUT_MS = 15000;
const SAIJ_HOME_URL = 'https://www.saij.gob.ar/';
const HTML_ERROR_PREVIEW_LIMIT = 300;
const ERROR_RESPONSE_PREVIEW_LIMIT = 500;

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

const previewResponseData = (data: unknown): string | null => {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data.slice(0, ERROR_RESPONSE_PREVIEW_LIMIT);
  try {
    return JSON.stringify(data).slice(0, ERROR_RESPONSE_PREVIEW_LIMIT);
  } catch {
    return String(data).slice(0, ERROR_RESPONSE_PREVIEW_LIMIT);
  }
};

const sanitizeProxyAgentUrl = (proxyUrl?: string | null): string | null => {
  const value = String(proxyUrl || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol || 'http:';
    const host = parsed.hostname || '';
    const port = parsed.port || '';
    if (!host || !port) return `${protocol}//${host}`;
    return `${protocol}//***:***@${host}:${port}`;
  } catch {
    return 'invalid_proxy_url';
  }
};

const toSetCookieArray = (headers: AxiosResponse['headers'] | undefined): string[] => {
  const setCookieHeader = (headers as any)?.getSetCookie?.() ?? (headers as any)?.['set-cookie'] ?? (headers as any)?.['Set-Cookie'];
  if (Array.isArray(setCookieHeader)) {
    return setCookieHeader.map((item) => String(item)).filter(Boolean);
  }
  if (typeof setCookieHeader === 'string' && setCookieHeader.trim().length > 0) {
    return [setCookieHeader];
  }
  return [];
};

const isTlsLikeError = (error: unknown): boolean => {
  const err = error as any;
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    code.includes('TLS') ||
    code.includes('SSL') ||
    code.includes('CERT') ||
    code === 'EPROTO' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    message.includes('tls') ||
    message.includes('ssl') ||
    message.includes('certificate') ||
    message.includes('handshake')
  );
};

const classifyProxyFailure = (error: unknown): string => {
  const status = extractStatusFromError(error);
  if (status === 407) return 'proxy_auth_required';
  if (status === 403) return 'forbidden';
  const code = String(extractErrorCode(error) || '').toUpperCase();
  if (code === 'ECONNREFUSED') return 'econnrefused';
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || code === 'SAIJ_TIMEOUT') return 'etimedout';
  if (code === 'ECONNRESET') return 'econnreset';
  if (isTlsLikeError(error)) return 'tls_ssl_error';
  return 'unknown';
};

const extractOriginalErrorObservability = (error: unknown) => {
  const err = error as any;
  return {
    errorName: err?.name ?? null,
    errorCode: extractErrorCode(error) ?? null,
    errorMessage: err?.message ?? null,
    errorCause: err?.cause ? String(err.cause) : null,
    errorConstructorName: err?.constructor?.name ?? null,
    errorStack: err?.stack ?? null,
    responseStatus: extractStatusFromError(error) ?? null,
    responseHeaders: err?.response?.headers ?? null,
    responseDataPreview: previewResponseData(err?.response?.data),
  };
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
  if (status === 407) return 'proxy_auth_required';
  if (status === 403) return 'forbidden';
  const code = String(extractErrorCode(error) || '').toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'SAIJ_TIMEOUT') return 'timeout';
  if (code === 'ECONNRESET') return 'econnreset';
  if (code === 'ECONNREFUSED') return 'econnrefused';
  if (isTlsLikeError(error)) return 'tls_ssl_error';
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
          proxyPort: proxy.port,
          proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
          attempt,
          url,
        },
        'SAIJ proxy request attempt'
      );

      try {
        await this.ensureSession(context, { requestName: options.requestName, attempt, url });

        const { response } = await this.requestGetWithCookies(context, url, {
          validateStatus: () => true,
          timeout: options.timeoutMs ?? env.saijProxyTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          responseType: options.responseType,
          headers: {
            Accept: options.accept ?? BASE_BROWSER_HEADERS.Accept,
          },
          transformResponse: options.responseType === 'text' ? [(raw) => raw] : undefined,
        });

        const contentType = String(response.headers['content-type'] ?? '');
        const effectiveUrl = this.resolveResponseUrl(response, url);

        logger.info(
          {
            requestName: options.requestName,
            proxyEnabled: true,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
            proxyPort: proxy.port,
            proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
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
            proxyHost: proxy.host,
            proxyPort: proxy.port,
            responseHeaders: response.headers,
            responseDataPreview: previewResponseData(response.data),
            errorName: null,
            errorCause: null,
            errorConstructorName: null,
            errorStack: null,
            failureType: 'forbidden',
          });

          await this.resetSession(context, 'proxy_403_response');

          logger.warn(
            {
              requestName: options.requestName,
              proxyEnabled: true,
              proxyId: proxy.proxyId,
              proxyHost: proxy.host,
              proxyPort: proxy.port,
              proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
              attempt,
              status: response.status,
              retryReason: 'forbidden',
              proxyBlockedUntil: getProxyBlockedUntil(proxy.proxyId),
              responseHeaders: response.headers,
              responseDataPreview: previewResponseData(response.data),
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
        const failureType = classifyProxyFailure(error);
        const originalError = extractOriginalErrorObservability(error);

        logger.error(
          {
            requestName: options.requestName,
            proxyEnabled: true,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
            proxyPort: proxy.port,
            proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
            attempt,
            url,
            failureType,
            ...originalError,
          },
          'SAIJ proxy original error'
        );

        saijProxyPool.markFailure(proxy.proxyId, {
          status: extractStatusFromError(error),
          errorCode: extractErrorCode(error),
          message: (error as any)?.message,
          proxyHost: proxy.host,
          proxyPort: proxy.port,
          errorName: originalError.errorName,
          errorCause: originalError.errorCause,
          errorConstructorName: originalError.errorConstructorName,
          errorStack: originalError.errorStack,
          responseHeaders: originalError.responseHeaders,
          responseDataPreview: originalError.responseDataPreview,
          failureType,
        });

        await this.resetSession(context, `proxy_error_${retryReason}`);

        logger.warn(
          {
            requestName: options.requestName,
            proxyEnabled: true,
            proxyId: proxy.proxyId,
            proxyHost: proxy.host,
            proxyPort: proxy.port,
            proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
            attempt,
            url,
            status: extractStatusFromError(error),
            retryReason,
            failureType,
            proxyBlockedUntil: getProxyBlockedUntil(proxy.proxyId),
            ...originalError,
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
      lastError: extractOriginalErrorObservability(lastError),
      proxyEnabled: true,
    });
  }

  async proxyTestSaijFlow(): Promise<{
    ok: true;
    proxyId: string | null;
    proxyHost: string | null;
    proxyPort: number | null;
    proxyAgentUrlSanitized: string | null;
    bootstrapStatus: number;
    cookiesReceived: boolean;
    minimalSearchStatus: number;
    minimalSearchContentType: string;
  }> {
    const useProxy = saijProxyPool.isEnabled();
    const proxy = useProxy ? saijProxyPool.acquireProxy() : null;
    const context = this.getOrCreateSession(proxy);
    const searchUrlPath = '/busqueda?r=&o=0&p=1&f=&s=&v=colapsada';

    logger.info(
      {
        requestName: 'proxy-test',
        url: searchUrlPath,
        proxyEnabled: useProxy,
        proxyId: proxy?.proxyId ?? null,
        proxyHost: proxy?.host ?? null,
        proxyPort: proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy?.agentUrl || null),
        axiosProxyFalse: context.http.defaults.proxy === false,
        hasHttpsAgent: Boolean((context.http.defaults as any)?.httpsAgent),
        hasHttpAgent: Boolean((context.http.defaults as any)?.httpAgent),
        wrappedWithCookieJarSupport: false,
        hasCookieJar: false,
      },
      'SAIJ proxy test request config'
    );

    try {
      await this.resetSession(context, 'proxy_test_start');

      await this.ensureSession(context, { requestName: 'proxy-test', attempt: 1, url: SAIJ_HOME_URL });

      const { response } = await this.requestGetWithCookies(context, searchUrlPath, {
        validateStatus: () => true,
        timeout: env.saijProxyTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (response.status >= 400) {
        throw new HttpError(502, 'saij_proxy_test_failed', 'proxy-test returned non-success status', {
          status: response.status,
          headers: response.headers,
          dataPreview: previewResponseData(response.data),
        });
      }

      const contentType = String(response.headers['content-type'] ?? '');
      if (contentType.includes('text/html')) {
        throw new HttpError(502, 'saij_proxy_test_failed', 'proxy-test returned HTML for SAIJ search', {
          status: response.status,
          contentType,
          dataPreview: previewResponseData(response.data),
        });
      }

      if (proxy) saijProxyPool.markSuccess(proxy.proxyId);

      return {
        ok: true,
        proxyId: proxy?.proxyId ?? null,
        proxyHost: proxy?.host ?? null,
        proxyPort: proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy?.agentUrl || null),
        bootstrapStatus: context.lastBootstrapStatus ?? 0,
        cookiesReceived: context.lastBootstrapCookiesReceived,
        minimalSearchStatus: response.status,
        minimalSearchContentType: contentType,
      };
    } catch (error) {
      const failureType = classifyProxyFailure(error);
      const originalError = extractOriginalErrorObservability(error);

      logger.error(
        {
          requestName: 'proxy-test',
          url: searchUrlPath,
          proxyEnabled: useProxy,
          proxyId: proxy?.proxyId ?? null,
          proxyHost: proxy?.host ?? null,
          proxyPort: proxy?.port ?? null,
          proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy?.agentUrl || null),
          failureType,
          ...originalError,
        },
        'SAIJ proxy test original error'
      );

      if (proxy) {
        saijProxyPool.markFailure(proxy.proxyId, {
          status: extractStatusFromError(error),
          errorCode: extractErrorCode(error),
          message: (error as any)?.message,
          proxyHost: proxy.host,
          proxyPort: proxy.port,
          errorName: originalError.errorName,
          errorCause: originalError.errorCause,
          errorConstructorName: originalError.errorConstructorName,
          errorStack: originalError.errorStack,
          responseHeaders: originalError.responseHeaders,
          responseDataPreview: originalError.responseDataPreview,
          failureType,
        });
      }

      throw new HttpError(502, 'saij_proxy_test_failed', 'Proxy test failed', {
        proxyId: proxy?.proxyId ?? null,
        proxyHost: proxy?.host ?? null,
        proxyPort: proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy?.agentUrl || null),
        failureType,
        ...originalError,
      });
    }
  }

  private async requestGetWithCookies(
    context: SessionContext,
    requestUrl: string,
    config: AxiosRequestConfig
  ): Promise<{ response: AxiosResponse; cookiesReceived: boolean }> {
    const absoluteUrl = this.toAbsoluteUrl(requestUrl);
    const cookieHeader = await this.getCookieHeader(context.jar, absoluteUrl);
    const headers = {
      ...(config.headers || {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const response = await context.http.get(requestUrl, {
      ...config,
      headers,
    });

    const responseUrl = this.resolveResponseUrl(response, requestUrl);
    const responseAbsoluteUrl = this.toAbsoluteUrl(responseUrl);
    const cookiesReceived = await this.persistResponseCookies(context.jar, responseAbsoluteUrl, response);
    return { response, cookiesReceived };
  }

  private toAbsoluteUrl(inputUrl: string): string {
    if (isAbsoluteUrl(inputUrl)) return inputUrl;
    return `${env.saijBaseUrl}${inputUrl.startsWith('/') ? inputUrl : `/${inputUrl}`}`;
  }

  private async getCookieHeader(jar: CookieJar, targetUrl: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      jar.getCookieString(targetUrl, (error, cookies) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(cookies || ''));
      });
    });
  }

  private async persistResponseCookies(jar: CookieJar, targetUrl: string, response: AxiosResponse): Promise<boolean> {
    const setCookies = toSetCookieArray(response.headers);
    if (setCookies.length < 1) return false;

    for (const rawCookie of setCookies) {
      await new Promise<void>((resolve) => {
        jar.setCookie(rawCookie, targetUrl, { ignoreError: true }, () => resolve());
      });
    }
    return true;
  }

  private async executeDirect(url: string, options: SaijRequestOptions): Promise<SaijRequestResult> {
    const context = this.getOrCreateSession(null);
    await this.ensureSession(context, { requestName: options.requestName, attempt: 1, url });

    const maxAttempts = options.retry403 ? 2 : 1;
    let retryUsed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const { response } = await this.requestGetWithCookies(context, url, {
          validateStatus: () => true,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          responseType: options.responseType,
          headers: {
            Accept: options.accept ?? BASE_BROWSER_HEADERS.Accept,
          },
          transformResponse: options.responseType === 'text' ? [(raw) => raw] : undefined,
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

  private createHttpClient(proxy: SaijProxySelection | null): AxiosInstance {
    if (proxy) {
      const proxyAgent = new HttpsProxyAgent(proxy.agentUrl);
      const client = axios.create({
        baseURL: env.saijBaseUrl,
        timeout: env.saijProxyTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: BASE_BROWSER_HEADERS,
        proxy: false,
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
      });
      logger.info(
        {
          proxyEnabled: true,
          proxyId: proxy.proxyId,
          proxyHost: proxy.host,
          proxyPort: proxy.port,
          proxyAgentUrlSanitized: sanitizeProxyAgentUrl(proxy.agentUrl),
          axiosProxyFalse: client.defaults.proxy === false,
          hasHttpsAgent: Boolean((client.defaults as any)?.httpsAgent),
          hasHttpAgent: Boolean((client.defaults as any)?.httpAgent),
          wrappedWithCookieJarSupport: false,
          hasCookieJar: false,
        },
        'SAIJ axios proxy client created'
      );
      return client;
    }

    const client = axios.create({
      baseURL: env.saijBaseUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: BASE_BROWSER_HEADERS,
    });
    logger.info(
      {
        proxyEnabled: false,
        axiosProxyFalse: client.defaults.proxy === false,
        hasHttpsAgent: Boolean((client.defaults as any)?.httpsAgent),
        hasHttpAgent: Boolean((client.defaults as any)?.httpAgent),
        wrappedWithCookieJarSupport: false,
        hasCookieJar: false,
      },
      'SAIJ axios direct client created'
    );
    return client;
  }

  private getOrCreateSession(proxy: SaijProxySelection | null): SessionContext {
    const key = proxy ? proxy.proxyId : 'direct';
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const jar = new CookieJar();
    const context: SessionContext = {
      key,
      jar,
      http: this.createHttpClient(proxy),
      sessionReady: false,
      sessionInitInFlight: null,
      proxy,
      lastBootstrapStatus: null,
      lastBootstrapCookiesReceived: false,
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
    const { response: homeResponse, cookiesReceived } = await this.requestGetWithCookies(context, '/', {
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
        proxyPort: context.proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(context.proxy?.agentUrl || null),
        attempt: metadata.attempt,
        url: resolvedUrl,
        status: homeResponse.status,
        contentType,
        cookiesReceived,
      },
      'SAIJ session bootstrap response'
    );

    context.lastBootstrapStatus = homeResponse.status;
    context.lastBootstrapCookiesReceived = cookiesReceived;

    if (homeResponse.status >= 400) {
      throw new HttpError(502, 'saij_session_init_failed', 'No se pudo iniciar sesion con SAIJ', {
        status: homeResponse.status,
        contentType,
        htmlPreview: preview,
        proxyEnabled: Boolean(context.proxy),
        proxyId: context.proxy?.proxyId ?? null,
        proxyHost: context.proxy?.host ?? null,
        proxyPort: context.proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(context.proxy?.agentUrl || null),
      });
    }

    context.sessionReady = true;
  }

  private async resetSession(context: SessionContext, reason: string): Promise<void> {
    context.jar = new CookieJar();
    context.http = this.createHttpClient(context.proxy);
    context.sessionReady = false;
    context.lastBootstrapStatus = null;
    context.lastBootstrapCookiesReceived = false;

    logger.warn(
      {
        reason,
        proxyEnabled: Boolean(context.proxy),
        proxyId: context.proxy?.proxyId ?? null,
        proxyHost: context.proxy?.host ?? null,
        proxyPort: context.proxy?.port ?? null,
        proxyAgentUrlSanitized: sanitizeProxyAgentUrl(context.proxy?.agentUrl || null),
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
