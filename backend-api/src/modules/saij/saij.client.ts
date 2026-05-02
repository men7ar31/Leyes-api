import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { SaijDocumentRaw, SaijQuery, SaijSearchResponseRaw } from './saij.types';
import { saijHttpClient } from './saijHttpClient';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const withJitter = (ms: number) => ms + Math.floor(Math.random() * 180);
const HTML_ERROR_PREVIEW_LIMIT = 300;

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
    retryUsed?: boolean;
  };
};

const parseJsonPayload = (payload: unknown, invalidMessage: string) => {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      throw new HttpError(502, 'saij_invalid_json', invalidMessage);
    }
  }
  return payload;
};

const previewHtml = (payload: unknown): string | undefined => {
  if (typeof payload !== 'string') return undefined;
  const compact = payload.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, HTML_ERROR_PREVIEW_LIMIT);
};

const isServerRetryableStatus = (status: number) => status >= 500 || status === 429;

export class SaijClient {
  async search(query: SaijQuery): Promise<SaijClientSearchResult> {
    const params = new URLSearchParams();
    params.set('r', query.r ?? '');
    params.set('o', String(query.offset ?? 0));
    params.set('p', String(query.pageSize ?? 20));
    params.set('f', query.f ?? '');
    params.set('s', '');
    params.set('v', 'colapsada');

    const urlPath = `/busqueda?${params.toString()}`;
    const attempts = 4;

    for (let i = 1; i <= attempts; i += 1) {
      try {
        logger.info({ url: urlPath, attempt: i }, 'Calling SAIJ search');

        const { response } = await saijHttpClient.get(urlPath, {
          requestName: 'search',
          accept: 'application/json, text/plain, */*',
          timeoutMs: 15000,
        });

        const contentType = String(response.headers['content-type'] ?? '');

        if (isServerRetryableStatus(response.status)) {
          throw new HttpError(502, 'saij_error_status', `SAIJ respondio ${response.status}`, {
            status: response.status,
          });
        }

        if (contentType.includes('text/html')) {
          throw new HttpError(502, 'saij_html_response', 'SAIJ devolvio HTML inesperado en lugar de JSON', {
            status: response.status,
            contentType,
            preview: previewHtml(response.data),
            url: urlPath,
          });
        }

        const data = parseJsonPayload(response.data, 'Respuesta no es JSON parseable desde SAIJ');

        if (!data || typeof data !== 'object') {
          throw new HttpError(502, 'saij_invalid_response', 'Respuesta vacia o invalida desde SAIJ');
        }

        let jsonPreview: string | undefined;
        try {
          jsonPreview = JSON.stringify(data).slice(0, 1500);
        } catch {
          jsonPreview = undefined;
        }

        return {
          raw: data as SaijSearchResponseRaw,
          debug: {
            url: urlPath,
            status: response.status,
            contentType,
            jsonPreview,
          },
        };
      } catch (error) {
        const isTimeout = error instanceof HttpError && error.code === 'saij_timeout';
        if (isTimeout && i === attempts) {
          throw error;
        }

        logger.warn({ attempt: i, error }, 'SAIJ search failed');

        if (i === attempts) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, 'saij_error', 'Fallo al consultar SAIJ', { message: String(error) });
        }

        await sleep(withJitter(350 * i));
      }
    }

    throw new HttpError(502, 'saij_error', 'SAIJ search agoto reintentos');
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

    for (let i = 1; i <= attempts; i += 1) {
      try {
        logger.info({ url: urlPath, attempt: i }, 'Calling SAIJ view-document');

        const { response, retryUsed } = await saijHttpClient.get(urlPath, {
          requestName: 'view-document',
          accept: 'application/json, text/plain, */*',
          retry403: true,
          timeoutMs: 15000,
        });

        const contentType = String(response.headers['content-type'] ?? '');

        if (response.status === 403) {
          throw new HttpError(502, 'saij_document_blocked', 'No se pudo resolver el documento desde SAIJ', {
            status: response.status,
            contentType,
            retryUsed,
          });
        }

        if (isServerRetryableStatus(response.status)) {
          throw new HttpError(502, 'saij_error_status', `SAIJ respondio ${response.status}`, {
            status: response.status,
          });
        }

        if (contentType.includes('text/html')) {
          const preview = previewHtml(response.data);
          logger.warn(
            {
              url: urlPath,
              status: response.status,
              contentType,
              retryUsed,
              htmlPreview: preview,
            },
            'SAIJ view-document returned HTML'
          );
          throw new HttpError(502, 'saij_html_response', 'SAIJ devolvio HTML inesperado en view-document', {
            status: response.status,
            contentType,
            preview,
            retryUsed,
            url: urlPath,
          });
        }

        const data = parseJsonPayload(response.data, 'view-document no es JSON parseable');

        if (!data || typeof data !== 'object') {
          throw new HttpError(502, 'saij_invalid_response', 'view-document vacio o invalido');
        }

        let jsonPreview: string | undefined;
        try {
          jsonPreview = JSON.stringify(data).slice(0, 1500);
        } catch {
          jsonPreview = undefined;
        }

        return {
          raw: data as SaijDocumentRaw,
          debug: {
            url: urlPath,
            status: response.status,
            contentType,
            jsonPreview,
            retryUsed,
          },
        };
      } catch (error) {
        const isTimeout = error instanceof HttpError && error.code === 'saij_timeout';
        if (isTimeout && i === attempts) {
          throw error;
        }

        if (i === attempts) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, 'saij_error', 'Fallo view-document', { message: String(error) });
        }

        await sleep(300 * i);
      }
    }

    throw new HttpError(502, 'saij_error', 'view-document agoto reintentos');
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
      retryUsed?: boolean;
    };
  }> {
    logger.info({ url }, 'friendly fallback fetch start');

    try {
      const { response, retryUsed } = await saijHttpClient.get(url, {
        requestName: 'friendly-url',
        responseType: 'text',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        retry403: true,
        timeoutMs: 15000,
      });

      const contentType = response.headers['content-type'] as string | undefined;
      const finalUrl = response.request?.res?.responseUrl ?? url;
      const html = response.data as string;
      const htmlPreview = previewHtml(html);

      if (response.status >= 500 || response.status === 429) {
        throw new HttpError(502, 'saij_error_status', `SAIJ friendly-url respondio ${response.status}`, {
          status: response.status,
          retryUsed,
        });
      }

      if (response.status === 408) {
        throw new HttpError(504, 'friendly_timeout', 'Friendly URL timeout', { status: response.status });
      }

      if (!contentType || !contentType.includes('text/html')) {
        throw new HttpError(502, 'non_html_friendly_response', 'Friendly URL no devolvio HTML', {
          status: response.status,
          contentType,
          retryUsed,
        });
      }

      if (!html || html.length === 0) {
        throw new HttpError(502, 'saij_invalid_content_type', 'Friendly URL sin cuerpo HTML', {
          status: response.status,
          contentType,
          retryUsed,
        });
      }

      return {
        html,
        debug: {
          url,
          status: response.status,
          contentType,
          finalUrl,
          htmlPreview,
          retryUsed,
        },
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
