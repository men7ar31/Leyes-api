import { CacheService } from '../cache/cache.service';
import { infolegService } from '../infoleg/infoleg.service';
import { NormService } from '../norms/norm.service';
import { DOCUMENT_CACHE_TTL_MS, DOCUMENT_EXTRACTOR_VERSION, SEARCH_CACHE_TTL_MS } from '../saij/saij.constants';
import { SaijService } from '../saij/saij.service';
import { SaijDocumentResponse, SaijResolvedDocument, SaijSearchRequest, SaijSearchResponse } from '../saij/saij.types';
import { hashString } from '../../utils/hash';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';

type SourceUsed = 'cache' | 'infoleg' | 'provincial_codes' | 'saij';
type RouteStatus = 'start' | 'success' | 'fallback' | 'error';

type RouteLogInput = {
  action: 'search' | 'document';
  status: RouteStatus;
  contentType?: string | null;
  jurisdiccion?: string | null;
  guid?: string | null;
  sourceUsed?: SourceUsed | null;
  fallbackReason?: string | null;
  errorCode?: string | null;
};

const SEARCH_CACHE_TTL_SECONDS = Math.max(60, Math.floor(SEARCH_CACHE_TTL_MS / 1000));
const DOCUMENT_CACHE_TTL_MS_LOCAL = DOCUMENT_CACHE_TTL_MS;

const normalizeLoose = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isProvincialCodeTipoNorma = (value?: string | null) => {
  const tipo = normalizeLoose(value);
  return tipo === 'codigo_provincial' || tipo === 'codigos_provinciales';
};

const isSaijOnlyContentType = (contentType?: string | null) => {
  const ct = normalizeLoose(contentType);
  return ct === 'jurisprudencia' || ct === 'fallo' || ct === 'sumario' || ct === 'doctrina' || ct === 'dictamen';
};

const isLegislationLikeContentType = (contentType?: string | null) => {
  const ct = normalizeLoose(contentType);
  return ct === 'legislacion' || ct === 'todo' || ct === '';
};

const resolveJurisdictionLabel = (input: SaijSearchRequest) => {
  const kind = String(input.filters?.jurisdiccion?.kind || 'todas').trim();
  const province = String(input.filters?.jurisdiccion?.provincia || '').trim();
  if (!kind && !province) return 'todas';
  if (!province) return kind || 'todas';
  return `${kind}:${province}`;
};

const isNationalLegislationSearch = (input: SaijSearchRequest) => {
  if (!isLegislationLikeContentType(input.contentType)) return false;
  if (isProvincialCodeTipoNorma(input.filters?.tipoNorma)) return false;
  if (isSaijOnlyContentType(input.contentType)) return false;
  const jurisdictionKind = String(input.filters?.jurisdiccion?.kind || 'todas').toLowerCase();
  return jurisdictionKind !== 'provincial';
};

const looksLikeInfolegGuid = (guid: string) => {
  const clean = String(guid || '').trim();
  if (!clean) return false;
  if (/^infoleg(?::|-prov:)/i.test(clean)) return true;
  if (/^\d+$/.test(clean)) return true;
  if (/[?&]id=\d+/i.test(clean)) return true;
  return false;
};

const hasRenderableContent = (doc: any) =>
  Boolean(
    (typeof doc?.contentText === 'string' && doc.contentText.trim().length > 0) ||
      (typeof doc?.contentHtml === 'string' && doc.contentHtml.trim().length > 0) ||
      (Array.isArray(doc?.articles) && doc.articles.length > 0)
  );

const buildCachedDocument = (cacheDoc: any): SaijResolvedDocument => {
  const document: SaijResolvedDocument = {
    guid: String(cacheDoc.guid || ''),
    title: String(cacheDoc.title || 'Documento'),
    subtitle: typeof cacheDoc.subtitle === 'string' ? cacheDoc.subtitle : null,
    contentType: (cacheDoc.contentType || 'legislacion') as any,
    numeroNorma: typeof cacheDoc.numeroNorma === 'string' ? cacheDoc.numeroNorma : null,
    tipoNorma: typeof cacheDoc.tipoNorma === 'string' ? cacheDoc.tipoNorma : null,
    smartCitation: cacheDoc.smartCitation && typeof cacheDoc.smartCitation === 'object' ? cacheDoc.smartCitation : null,
    documentSubtype: typeof cacheDoc.documentSubtype === 'string' ? cacheDoc.documentSubtype : null,
    estadoVigencia: typeof cacheDoc.estadoVigencia === 'string' ? cacheDoc.estadoVigencia : null,
    tribunal: typeof cacheDoc.tribunal === 'string' ? cacheDoc.tribunal : null,
    fechaSentencia: typeof cacheDoc.fechaSentencia === 'string' ? cacheDoc.fechaSentencia : null,
    autor: typeof cacheDoc.autor === 'string' ? cacheDoc.autor : null,
    organismo: typeof cacheDoc.organismo === 'string' ? cacheDoc.organismo : null,
    metadata: cacheDoc.metadata && typeof cacheDoc.metadata === 'object' ? cacheDoc.metadata : {},
    contentHtml: typeof cacheDoc.contentHtml === 'string' ? cacheDoc.contentHtml : null,
    contentText: typeof cacheDoc.contentText === 'string' ? cacheDoc.contentText : null,
    headerText: typeof cacheDoc.headerText === 'string' ? cacheDoc.headerText : null,
    articles: Array.isArray(cacheDoc.articles) ? cacheDoc.articles : [],
    toc: Array.isArray(cacheDoc.toc) ? cacheDoc.toc : [],
    friendlyUrl: typeof cacheDoc.friendlyUrl === 'string' ? cacheDoc.friendlyUrl : null,
    sourceUrl: typeof cacheDoc.sourceUrl === 'string' ? cacheDoc.sourceUrl : null,
    attachment: cacheDoc.attachment ?? null,
    normasQueModifica: Array.isArray(cacheDoc.normasQueModifica) ? cacheDoc.normasQueModifica : [],
    normasComplementarias: Array.isArray(cacheDoc.normasComplementarias) ? cacheDoc.normasComplementarias : [],
    observaciones: Array.isArray(cacheDoc.observaciones) ? cacheDoc.observaciones : [],
    relatedFallos: Array.isArray(cacheDoc.relatedFallos) ? cacheDoc.relatedFallos : [],
    relatedContents: Array.isArray(cacheDoc.relatedContents) ? cacheDoc.relatedContents : [],
    fetchedAt: cacheDoc.fetchedAt?.toISOString?.() || new Date().toISOString(),
    fromCache: true,
    hasRenderableContent: hasRenderableContent(cacheDoc),
    contentUnavailableReason: hasRenderableContent(cacheDoc) ? null : 'cached_document_without_renderable_content',
  };
  return document;
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

const getErrorCode = (error: unknown) => {
  const err = error as any;
  const code = String(err?.code || err?.error || '').trim();
  return code || null;
};

const logRouteEvent = (input: RouteLogInput) => {
  logger.info(
    {
      action: input.action,
      contentType: input.contentType ?? null,
      jurisdiccion: input.jurisdiccion ?? null,
      sourceUsed: input.sourceUsed ?? null,
      fallbackReason: input.fallbackReason ?? null,
      status: input.status,
      errorCode: input.errorCode ?? null,
      guid: input.guid ?? null,
    },
    'Legal source routing'
  );
};

const persistDocumentCache = async (doc: SaijResolvedDocument, source: 'saij' | 'infoleg' | 'provincial_codes') => {
  if (!doc?.guid) return;
  const expiresAt = new Date(Date.now() + DOCUMENT_CACHE_TTL_MS_LOCAL);
  await NormService.save({
    guid: doc.guid,
    source,
    extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
    contentType: doc.contentType,
    numeroNorma: doc.numeroNorma ?? null,
    tipoNorma: doc.tipoNorma ?? null,
    smartCitation: doc.smartCitation ?? null,
    documentSubtype: doc.documentSubtype ?? null,
    estadoVigencia: doc.estadoVigencia ?? null,
    tribunal: doc.tribunal ?? null,
    fechaSentencia: doc.fechaSentencia ?? null,
    autor: doc.autor ?? null,
    organismo: doc.organismo ?? null,
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    metadata: doc.metadata ?? {},
    contentHtml: doc.contentHtml ?? null,
    contentText: doc.contentText ?? null,
    headerText: doc.headerText ?? null,
    articles: Array.isArray(doc.articles) ? doc.articles : [],
    toc: Array.isArray(doc.toc) ? doc.toc : [],
    sourceUrl: doc.sourceUrl ?? null,
    attachment: doc.attachment ?? null,
    normasQueModifica: Array.isArray(doc.normasQueModifica) ? doc.normasQueModifica : [],
    normasComplementarias: Array.isArray(doc.normasComplementarias) ? doc.normasComplementarias : [],
    observaciones: Array.isArray(doc.observaciones) ? doc.observaciones : [],
    relatedFallos: Array.isArray(doc.relatedFallos) ? doc.relatedFallos : [],
    relatedContents: Array.isArray(doc.relatedContents) ? doc.relatedContents : [],
    friendlyUrl: doc.friendlyUrl ?? null,
    fetchedAt: new Date(doc.fetchedAt || new Date().toISOString()),
    expiresAt,
  } as any);
};

const hasUsefulSearchResults = (response: SaijSearchResponse | null | undefined) =>
  Boolean(response && (Number(response.total || 0) > 0 || (Array.isArray(response.hits) && response.hits.length > 0)));

const buildSearchCacheKey = (input: SaijSearchRequest) =>
  `legal-router-search:v1:${hashString(
    JSON.stringify({
      contentType: input.contentType,
      filters: input.filters,
      offset: input.offset,
      pageSize: input.pageSize,
      debug: Boolean(input.debug),
    })
  )}`;

export const legalSourceRouter = {
  async search(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    const jurisdiction = resolveJurisdictionLabel(input);
    const contentType = input.contentType;
    const cacheKey = buildSearchCacheKey(input);

    logRouteEvent({
      action: 'search',
      status: 'start',
      contentType,
      jurisdiccion: jurisdiction,
      sourceUsed: 'cache',
    });

    if (!input.debug) {
      const cached = await CacheService.getSearch(cacheKey);
      if (cached) {
        logRouteEvent({
          action: 'search',
          status: 'success',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'cache',
        });
        return cached as SaijSearchResponse;
      }
    }

    const isProvincialCodeSearch = isProvincialCodeTipoNorma(input.filters?.tipoNorma);

    if (isSaijOnlyContentType(contentType)) {
      try {
        const response = await SaijService.search(input);
        if (!input.debug) await CacheService.saveSearch(cacheKey, input, response, SEARCH_CACHE_TTL_SECONDS);
        logRouteEvent({
          action: 'search',
          status: 'success',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
        });
        return response;
      } catch (error) {
        logRouteEvent({
          action: 'search',
          status: 'error',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
          errorCode: getErrorCode(error),
        });
        if (isSaijUnavailableError(error)) {
          throw new HttpError(503, 'saij_unavailable', 'SAIJ no está disponible temporalmente');
        }
        throw error;
      }
    }

    if (isProvincialCodeSearch) {
      let saijFailed = false;
      try {
        const saijResponse = await SaijService.search(input);
        if (hasUsefulSearchResults(saijResponse)) {
          if (!input.debug) await CacheService.saveSearch(cacheKey, input, saijResponse, SEARCH_CACHE_TTL_SECONDS);
          logRouteEvent({
            action: 'search',
            status: 'success',
            contentType,
            jurisdiccion: jurisdiction,
            sourceUsed: 'saij',
          });
          return saijResponse;
        }
        saijFailed = true;
        logRouteEvent({
          action: 'search',
          status: 'fallback',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'infoleg',
          fallbackReason: 'saij_empty_results',
        });
      } catch (error) {
        saijFailed = true;
        logRouteEvent({
          action: 'search',
          status: 'fallback',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'infoleg',
          fallbackReason: getErrorCode(error) ?? 'saij_error',
        });
      }

      try {
        const infolegResponse = await infolegService.search(input);
        if (!input.debug) await CacheService.saveSearch(cacheKey, input, infolegResponse, SEARCH_CACHE_TTL_SECONDS);
        logRouteEvent({
          action: 'search',
          status: 'success',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'infoleg',
        });
        return infolegResponse;
      } catch (infolegError) {
        logRouteEvent({
          action: 'search',
          status: 'error',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'infoleg',
          errorCode: getErrorCode(infolegError),
        });
        if (saijFailed) {
          throw new HttpError(
            503,
            'legal_source_unavailable',
            'No se pudo resolver el documento desde las fuentes disponibles'
          );
        }
        throw infolegError;
      }
    }

    if (isNationalLegislationSearch(input)) {
      try {
        const infolegResponse = await infolegService.search(input);
        if (hasUsefulSearchResults(infolegResponse)) {
          if (!input.debug) await CacheService.saveSearch(cacheKey, input, infolegResponse, SEARCH_CACHE_TTL_SECONDS);
          logRouteEvent({
            action: 'search',
            status: 'success',
            contentType,
            jurisdiccion: jurisdiction,
            sourceUsed: 'infoleg',
          });
          return infolegResponse;
        }

        logRouteEvent({
          action: 'search',
          status: 'fallback',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
          fallbackReason: 'infoleg_empty_results',
        });
      } catch (error) {
        logRouteEvent({
          action: 'search',
          status: 'fallback',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
          fallbackReason: getErrorCode(error) ?? 'infoleg_error',
          errorCode: getErrorCode(error),
        });
      }

      try {
        const saijResponse = await SaijService.search(input);
        if (!input.debug) await CacheService.saveSearch(cacheKey, input, saijResponse, SEARCH_CACHE_TTL_SECONDS);
        logRouteEvent({
          action: 'search',
          status: 'success',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
        });
        return saijResponse;
      } catch (error) {
        logRouteEvent({
          action: 'search',
          status: 'error',
          contentType,
          jurisdiccion: jurisdiction,
          sourceUsed: 'saij',
          errorCode: getErrorCode(error),
        });
        if (isSaijUnavailableError(error)) {
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

    const defaultResponse = await SaijService.search(input);
    if (!input.debug) await CacheService.saveSearch(cacheKey, input, defaultResponse, SEARCH_CACHE_TTL_SECONDS);
    logRouteEvent({
      action: 'search',
      status: 'success',
      contentType,
      jurisdiccion: jurisdiction,
      sourceUsed: 'saij',
    });
    return defaultResponse;
  },

  async getDocument(guid: string, opts?: { debug?: boolean }): Promise<SaijDocumentResponse> {
    const cleanGuid = String(guid || '').trim();
    if (!cleanGuid) {
      throw new HttpError(400, 'invalid_guid', 'guid requerido');
    }

    logRouteEvent({
      action: 'document',
      status: 'start',
      guid: cleanGuid,
      sourceUsed: 'cache',
    });

    if (!opts?.debug) {
      const cached = await NormService.getCached(cleanGuid);
      if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
        const cacheDoc = buildCachedDocument(cached);
        if (cacheDoc.hasRenderableContent) {
          logRouteEvent({
            action: 'document',
            status: 'success',
            guid: cleanGuid,
            sourceUsed: 'cache',
            contentType: cacheDoc.contentType,
          });
          return {
            ok: true,
            document: cacheDoc,
            debugInfo: { strategyUsed: 'cache' },
          };
        }
      }
    }

    const tryInfolegFirst = looksLikeInfolegGuid(cleanGuid);

    if (tryInfolegFirst) {
      try {
        const infolegDoc = await infolegService.getDocumentByGuid(cleanGuid, opts);
        if (!opts?.debug && infolegDoc?.document) {
          await persistDocumentCache(infolegDoc.document, 'infoleg');
        }
        logRouteEvent({
          action: 'document',
          status: 'success',
          guid: cleanGuid,
          sourceUsed: 'infoleg',
          contentType: infolegDoc?.document?.contentType,
        });
        return infolegDoc;
      } catch (infolegError) {
        logRouteEvent({
          action: 'document',
          status: 'fallback',
          guid: cleanGuid,
          sourceUsed: 'saij',
          fallbackReason: getErrorCode(infolegError) ?? 'infoleg_error',
          errorCode: getErrorCode(infolegError),
        });
      }
    }

    try {
      const saijDoc = await SaijService.getDocumentByGuid(cleanGuid, opts);
      logRouteEvent({
        action: 'document',
        status: 'success',
        guid: cleanGuid,
        sourceUsed: 'saij',
        contentType: saijDoc?.document?.contentType,
      });
      return saijDoc;
    } catch (saijError) {
      logRouteEvent({
        action: 'document',
        status: 'error',
        guid: cleanGuid,
        sourceUsed: 'saij',
        errorCode: getErrorCode(saijError),
      });

      if (isSaijUnavailableError(saijError) && !tryInfolegFirst) {
        throw new HttpError(503, 'saij_unavailable', 'SAIJ no está disponible temporalmente');
      }

      if (isSaijUnavailableError(saijError) && tryInfolegFirst) {
        throw new HttpError(
          503,
          'legal_source_unavailable',
          'No se pudo resolver el documento desde las fuentes disponibles'
        );
      }

      if (tryInfolegFirst) {
        throw new HttpError(
          503,
          'legal_source_unavailable',
          'No se pudo resolver el documento desde las fuentes disponibles'
        );
      }
      throw saijError;
    }
  },

  async debugDocument(guid: string) {
    const cleanGuid = String(guid || '').trim();
    if (looksLikeInfolegGuid(cleanGuid)) {
      return await infolegService.debugDocument(cleanGuid);
    }
    return await SaijService.debugFriendlyUrl(cleanGuid);
  },
};
