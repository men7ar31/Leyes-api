import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { HttpError } from '../../utils/httpError';
import { SaijQuery, SaijSearchResponseRaw } from './saij.types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SaijClientSearchResult = {
  raw: SaijSearchResponseRaw;
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
      timeout: 8000,
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

    const attempts = 3;
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
        await sleep(300 * i);
      }
    }

    throw new HttpError(502, 'saij_error', 'SAIJ search agotó reintentos');
  }

  async fetchDocument(_guid: string) {
    logger.warn('SaijClient.fetchDocument not implemented yet');
    throw new HttpError(501, 'not_implemented', 'SAIJ document not implemented');
  }
}
