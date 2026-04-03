import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { HttpError } from '../../utils/httpError';
import { SaijQuery, SaijSearchResponseRaw, SaijDocumentRaw } from './saij.types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const withJitter = (ms: number) => ms + Math.floor(Math.random() * 180);

export type SaijClientSearchResult = {
  raw: SaijSearchResponseRaw;
  debug: {
    url: string;
    status: number;
    contentType: string;
    jsonPreview?: string;
  };
};

export type SaijClientDocumentResult = {
  raw: SaijDocumentRaw;
  debug: {
    url: string;
    status: number;
    contentType: string;
    jsonPreview?: string;
  };
};

export class SaijClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.saijBaseUrl,
      timeout: 15000,
      headers: {
        'User-Agent': 'backend-api/0.1 (+github.com/)',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.saij.gob.ar/',
        'Cache-Control': 'no-cache',
      },
    });
  }

  async search(query: SaijQuery): Promise<SaijClientSearchResult> {
    const params = new URLSearchParams();
    params.set('r', query.r ?? '');
    params.set('o', String(query.offset ?? 0));
    params.set('p', String(query.pageSize ?? 20));
    params.set('f', query.f ?? '');
    params.set('s', '');
    params.set('v', 'colapsada');

    const attempts = 4;
    for (let i = 1; i <= attempts; i++) {
      try {
        const urlPath = `/busqueda?${params.toString()}`;
        logger.info({ url: `${env.saijBaseUrl}${urlPath}` }, 'Calling SAIJ');

        const res = await this.http.get(urlPath, { validateStatus: () => true });

        const contentType = res.headers['content-type'] ?? '';
        const url = res.request?.path || urlPath;
        logger.info({ url, status: res.status, contentType }, 'SAIJ search response');

        if (res.status >= 500 || res.status === 429) {
          throw new HttpError(502, 'saij_error_status', `SAIJ respondió ${res.status}`, {
            status: res.status,
          });
        }

        if (contentType.includes('text/html')) {
          const preview = typeof res.data === 'string' ? res.data.slice(0, 200) : '';
          throw new HttpError(
            502,
            'saij_html_response',
            'SAIJ devolvió HTML inesperado en lugar de JSON',
            { status: res.status, contentType, preview, url }
          );
        }

        let data: any = res.data;
        let jsonPreview: string | undefined;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (_parseErr) {
            throw new HttpError(502, 'saij_invalid_json', 'Respuesta no es JSON parseable desde SAIJ');
          }
        }

        if (!data || typeof data !== 'object') {
          throw new HttpError(502, 'saij_invalid_response', 'Respuesta vacía o inválida desde SAIJ');
        }

        try {
          jsonPreview = JSON.stringify(data).slice(0, 1500);
        } catch {
          jsonPreview = undefined;
        }

        return {
          raw: data as SaijSearchResponseRaw,
          debug: {
            url: `${env.saijBaseUrl}${urlPath}`,
            status: res.status,
            contentType,
            jsonPreview,
          },
        };
      } catch (error) {
        const isAxiosTimeout = error instanceof AxiosError && error.code === 'ECONNABORTED';
        if (isAxiosTimeout) {
          if (i === attempts) throw new HttpError(504, 'saij_timeout', 'SAIJ no respondió a tiempo');
        }
        logger.warn({ attempt: i, error }, 'SAIJ search failed');
        if (i === attempts) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, 'saij_error', 'Fallo al consultar SAIJ', { message: String(error) });
        }
        await sleep(withJitter(350 * i));
      }
    }

    throw new HttpError(502, 'saij_error', 'SAIJ search agotó reintentos');
  }

  async fetchDocument(_guid: string) {
    logger.warn('SaijClient.fetchDocument not implemented yet');
    throw new HttpError(501, 'not_implemented', 'SAIJ document not implemented');
  }

  async fetchSaijDocumentByGuid(guid: string): Promise<SaijClientDocumentResult> {
    const params = new URLSearchParams();
    params.set('guid', guid);
    const urlPath = `/view-document?${params.toString()}`;

    const attempts = 3;
    for (let i = 1; i <= attempts; i++) {
      try {
        logger.info({ url: `${env.saijBaseUrl}${urlPath}` }, 'Calling SAIJ view-document');
        const res = await this.http.get(urlPath, { validateStatus: () => true, timeout: 8000 });
        const contentType = res.headers['content-type'] ?? '';
        const url = res.request?.path || urlPath;
        if (res.status >= 500 || res.status === 429) {
          throw new HttpError(502, 'saij_error_status', `SAIJ respondió ${res.status}`, { status: res.status });
        }
        if (contentType.includes('text/html')) {
          const preview = typeof res.data === 'string' ? res.data.slice(0, 200) : '';
          throw new HttpError(
            502,
            'saij_html_response',
            'SAIJ devolvió HTML inesperado en view-document',
            { status: res.status, contentType, preview, url }
          );
        }
        let data: any = res.data;
        let jsonPreview: string | undefined;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            throw new HttpError(502, 'saij_invalid_json', 'view-document no es JSON parseable');
          }
        }
        if (!data || typeof data !== 'object') {
          throw new HttpError(502, 'saij_invalid_response', 'view-document vacío o inválido');
        }
        try {
          jsonPreview = JSON.stringify(data).slice(0, 1500);
        } catch {
          jsonPreview = undefined;
        }
        return {
          raw: data as SaijDocumentRaw,
          debug: {
            url: `${env.saijBaseUrl}${urlPath}`,
            status: res.status,
            contentType,
            jsonPreview,
          },
        };
      } catch (error) {
        const isTimeout = error instanceof AxiosError && error.code === 'ECONNABORTED';
        if (isTimeout && i === attempts) {
          throw new HttpError(504, 'saij_timeout', 'SAIJ view-document timeout');
        }
        if (i === attempts) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, 'saij_error', 'Fallo view-document', { message: String(error) });
        }
        await sleep(300 * i);
      }
    }
    throw new HttpError(502, 'saij_error', 'view-document agotó reintentos');
  }

  async fetchFriendlyUrl(url: string): Promise<{
    html: string;
    debug: {
      url: string;
      status: number | undefined;
      contentType: string | undefined;
      finalUrl?: string;
      htmlPreview?: string;
      errorName?: string;
      errorMessage?: string;
    };
  }> {
    logger.info({ url }, 'friendly fallback fetch start');
    try {
      const res = await this.http.get(url, {
        responseType: 'text',
        transformResponse: (x) => x,
        validateStatus: () => true,
        timeout: 8000,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          Referer: 'https://www.saij.gob.ar/',
          'Cache-Control': 'no-cache',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
        maxRedirects: 5,
      });
      const contentType = res.headers['content-type'] as string | undefined;
      const finalUrl = res.request?.res?.responseUrl ?? url;
      const html = res.data as string;
      const htmlPreview = typeof html === 'string' ? html.slice(0, 1000) : '';

      logger.info({ url, finalUrl, status: res.status, contentType }, 'friendly fallback fetch response');

      if (res.status === 0) {
        throw new HttpError(502, 'saij_error', 'Friendly URL network error', { status: res.status });
      }
      if (res.status >= 500 || res.status === 429) {
        throw new HttpError(502, 'saij_error_status', `SAIJ friendly-url respondió ${res.status}`, { status: res.status });
      }
      if (res.status === 408) {
        throw new HttpError(504, 'friendly_timeout', 'Friendly URL timeout', { status: res.status });
      }
      if (!contentType || !contentType.includes('text/html')) {
        throw new HttpError(502, 'non_html_friendly_response', 'Friendly URL no devolvió HTML', {
          status: res.status,
          contentType,
        });
      }
      if (!html || html.length === 0) {
        throw new HttpError(502, 'saij_invalid_content_type', 'Friendly URL sin cuerpo HTML', {
          status: res.status,
          contentType,
        });
      }
      return {
        html,
        debug: { url, status: res.status, contentType, finalUrl, htmlPreview },
      };
    } catch (error: any) {
      logger.warn(
        {
          url,
          name: error?.name,
          message: error?.message,
          status: error?.response?.status,
          finalUrl: error?.response?.request?.res?.responseUrl,
        },
        'friendly fallback fetch error'
      );
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'friendly_network_error', 'Fallo friendly-url', {
        name: error?.name,
        message: error?.message,
      });
    }
  }
}
