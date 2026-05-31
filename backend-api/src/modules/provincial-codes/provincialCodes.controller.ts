import type { NextFunction, Request, Response } from 'express';
import { provincialCodesService } from './provincialCodes.service';
import { SaijService } from '../saij/saij.service';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';

const getErrorCode = (error: unknown) => {
  const err = error as any;
  const code = String(err?.code || err?.error || '').trim();
  return code || null;
};

const isSaijUnavailableError = (error: unknown) => {
  const err = error as any;
  const code = String(err?.code || '').toLowerCase();
  const status = Number(err?.statusCode || err?.status || err?.details?.status || err?.response?.status || 0);
  return (
    code === 'saij_session_init_failed' ||
    code === 'saij_search_temporarily_unavailable' ||
    code === 'saij_error_status' ||
    code === 'saij_timeout' ||
    code === 'saij_error' ||
    (code.startsWith('saij_') && status === 403) ||
    status === 403
  );
};

const resolveTextFromSaijDocument = (doc: any): string => {
  const contentText = String(doc?.contentText || '').trim();
  if (contentText) return contentText;

  const articles = Array.isArray(doc?.articles) ? doc.articles : [];
  const fromArticles = articles
    .map((article: any, index: number) => {
      const number = String(article?.number || index + 1).trim();
      const title = String(article?.title || '').trim();
      const text = String(article?.text || '').trim();
      const heading = title ? `Articulo ${number} - ${title}` : `Articulo ${number}`;
      return [heading, text].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return fromArticles;
};

export class ProvincialCodesController {
  static async getDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { province, area, reference, numeroNorma } = (req.body || {}) as {
        province?: string;
        area?: string;
        reference?: string;
        numeroNorma?: string;
      };

      const requestPayload = {
        province: String(province || ''),
        area: String(area || ''),
        reference: String(reference || ''),
        numeroNorma: String(numeroNorma || ''),
      };

      try {
        const document = await provincialCodesService.fetchDocument(requestPayload);
        logger.info(
          {
            action: 'document',
            contentType: 'legislacion',
            jurisdiccion: requestPayload.province,
            sourceUsed: 'provincial_codes',
            fallbackReason: null,
            status: 'success',
            errorCode: null,
            guid: null,
          },
          'Legal source routing'
        );

        return res.json({
          ok: true,
          document,
        });
      } catch (primaryError) {
        logger.info(
          {
            action: 'document',
            contentType: 'legislacion',
            jurisdiccion: requestPayload.province,
            sourceUsed: 'saij',
            fallbackReason: getErrorCode(primaryError) ?? 'provincial_codes_error',
            status: 'fallback',
            errorCode: getErrorCode(primaryError),
            guid: null,
          },
          'Legal source routing'
        );

        try {
          const search = await SaijService.search({
            contentType: 'legislacion',
            filters: {
              tipoNorma: 'codigo_provincial',
              jurisdiccion: { kind: 'provincial', provincia: requestPayload.province },
              numeroNorma: requestPayload.numeroNorma || undefined,
              textoEnNorma: `codigo ${requestPayload.area} ${requestPayload.reference}`.trim(),
            },
            offset: 0,
            pageSize: 10,
          });

          const candidate = (search.hits || [])[0];
          if (!candidate?.guid) {
            throw primaryError;
          }

          const docResponse = await SaijService.getDocumentByGuid(candidate.guid);
          const contentText = resolveTextFromSaijDocument(docResponse.document);
          if (!contentText) {
            throw primaryError;
          }

          logger.info(
            {
              action: 'document',
              contentType: docResponse.document.contentType,
              jurisdiccion: requestPayload.province,
              sourceUsed: 'saij',
              fallbackReason: null,
              status: 'success',
              errorCode: null,
              guid: candidate.guid,
            },
            'Legal source routing'
          );

          return res.json({
            ok: true,
            document: {
              title: String(docResponse.document.title || `${requestPayload.area} - ${requestPayload.province}`),
              sourceUrl: String(docResponse.document.sourceUrl || docResponse.document.friendlyUrl || ''),
              contentText,
              fetchedAt: String(docResponse.document.fetchedAt || new Date().toISOString()),
            },
          });
        } catch (saijError) {
          logger.info(
            {
              action: 'document',
              contentType: 'legislacion',
              jurisdiccion: requestPayload.province,
              sourceUsed: 'saij',
              fallbackReason: getErrorCode(saijError) ?? 'saij_error',
              status: 'error',
              errorCode: getErrorCode(saijError),
              guid: null,
            },
            'Legal source routing'
          );

          if (isSaijUnavailableError(saijError)) {
            throw new HttpError(
              503,
              'legal_source_unavailable',
              'No se pudo resolver el documento desde las fuentes disponibles'
            );
          }

          throw new HttpError(
            503,
            'legal_source_unavailable',
            'No se pudo resolver el documento desde las fuentes disponibles'
          );
        }
      }

    } catch (error) {
      next(error);
    }
  }
}
