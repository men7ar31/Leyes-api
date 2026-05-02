import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { env } from '../../config/env';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';

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
  return error instanceof AxiosError && error.code === 'ECONNABORTED';
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export class SaijHttpClient {
  private jar: CookieJar;
  private http: AxiosInstance;
  private sessionReady = false;
  private sessionInitInFlight: Promise<void> | null = null;

  constructor() {
    this.jar = new CookieJar();
    this.http = this.createHttpClient(this.jar);
  }

  async get(url: string, options: SaijRequestOptions): Promise<SaijRequestResult> {
    await this.ensureSession();

    const maxAttempts = options.retry403 ? 2 : 1;
    let retryUsed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.http.get(url, {
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
              url: effectiveUrl,
              status: response.status,
              contentType,
              retryUsed,
              htmlPreview: preview,
            },
            'SAIJ returned 403, resetting session and retrying once'
          );
          await this.resetSession('403_retry');
          await this.ensureSession();
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

  private createHttpClient(jar: CookieJar): AxiosInstance {
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

  private async ensureSession(forceReset = false): Promise<void> {
    if (forceReset) {
      await this.resetSession('forced');
    }

    if (this.sessionReady) {
      return;
    }

    if (this.sessionInitInFlight) {
      await this.sessionInitInFlight;
      return;
    }

    this.sessionInitInFlight = this.bootstrapSession();
    try {
      await this.sessionInitInFlight;
    } finally {
      this.sessionInitInFlight = null;
    }
  }

  private async bootstrapSession(): Promise<void> {
    // SAIJ can block direct document calls when the session/cookies are missing.
    const homeResponse = await this.http.get('/', {
      validateStatus: () => true,
      timeout: DEFAULT_TIMEOUT_MS,
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
      });
    }

    this.sessionReady = true;
  }

  private async resetSession(reason: string): Promise<void> {
    this.jar = new CookieJar();
    this.http = this.createHttpClient(this.jar);
    this.sessionReady = false;

    logger.warn({ reason }, 'SAIJ session reset');
  }

  private resolveResponseUrl(response: AxiosResponse, requestUrl: string): string {
    const direct = response.request?.res?.responseUrl;
    if (typeof direct === 'string' && direct.length > 0) return direct;
    if (isAbsoluteUrl(requestUrl)) return requestUrl;
    return `${env.saijBaseUrl}${requestUrl}`;
  }
}

export const saijHttpClient = new SaijHttpClient();
