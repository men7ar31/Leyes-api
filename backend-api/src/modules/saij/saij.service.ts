import { logger } from '../../utils/logger';
import { hashString } from '../../utils/hash';
import { CacheService } from '../cache/cache.service';
import { SaijCache } from './saij.cache';
import { SaijClient } from './saij.client';
import { buildSaijQuery } from './saij.query-builder';
import { mapSaijSearchHit, mapSaijDocument, isDocumentContentEmpty, mergeDocumentContent, isLikelyLegalBodyText } from './saij.mapper';
import { SaijSearchRequest, SaijSearchResponse, SaijDocumentResponse } from './saij.types';
import { SEARCH_CACHE_TTL_MS, DOCUMENT_CACHE_TTL_MS } from './saij.constants';
import { HttpError } from '../../utils/httpError';
import { NormService } from '../norms/norm.service';

const cache = new SaijCache();
const client = new SaijClient();
const DOCUMENT_EXTRACTOR_VERSION = 4;
const JURIS_SUMARIO_FACET =
  'Total|Tipo de Documento/Jurisprudencia/Sumario|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';

const safeParseJson = (payload?: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const stripHtmlToText = (html?: string | null) => {
  if (!html || typeof html !== 'string') return null;
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const detectBlockReason = (htmlPreview?: string) => {
  if (!htmlPreview) return undefined;
  const lower = htmlPreview.toLowerCase();
  if (lower.includes('access denied') || lower.includes('forbidden') || lower.includes('not authorized')) {
    return 'blocked_html';
  }
  if (lower.includes('captcha')) return 'blocked_html';
  if (lower.includes('cookie') || lower.includes('consent')) return 'consent_page';
  if (lower.includes('window.location') || lower.includes('redirect')) return 'redirect_page';
  return undefined;
};

const resolveUnavailableReason = (error: any) => {
  const code = error?.code as string | undefined;
  const status = error?.statusCode ?? error?.status ?? error?.response?.status;
  if (code?.includes('timeout') || status === 504) return 'saij_timeout';
  if (code?.includes('blocked') || code?.includes('html_response')) return 'saij_blocked';
  if (status === 500) return 'saij_friendly_500';
  return 'saij_document_only_metadata';
};

const hasRenderableDocumentContent = (doc: any) =>
  !isDocumentContentEmpty({
    contentHtml: doc?.contentHtml,
    contentText: doc?.contentText,
    articles: Array.isArray(doc?.articles) ? doc.articles : [],
  });

const isCurrentExtractorVersion = (doc: any) =>
  (doc?.extractorVersion ?? 0) === DOCUMENT_EXTRACTOR_VERSION;

const buildDocumentFromMongo = (mongo: any, overrides?: { contentUnavailableReason?: string | null; fromCache?: boolean }) => {
  let contentHtml = typeof mongo?.contentHtml === 'string' ? mongo.contentHtml : null;
  let contentText = typeof mongo?.contentText === 'string' ? mongo.contentText : null;
  let articles = Array.isArray(mongo?.articles) ? mongo.articles : [];
  const contentType = (mongo?.contentType as string | undefined) ?? 'legislacion';
  const hasArticles = Array.isArray(articles) && articles.length > 0;
  if (contentType === 'legislacion' && !hasArticles && contentText && !isLikelyLegalBodyText(contentText)) {
    contentText = null;
    articles = [];
  }
  if (contentType === 'legislacion' && !hasArticles && !contentText && contentHtml) {
    const htmlText = stripHtmlToText(contentHtml);
    if (htmlText && isLikelyLegalBodyText(htmlText)) {
      contentText = htmlText;
    } else {
      contentHtml = null;
      articles = [];
    }
  }
  const toc = Array.isArray(mongo?.toc) ? mongo.toc : [];
  const doc = {
    guid: mongo.guid,
    title: mongo.title,
    subtitle: typeof mongo.subtitle === 'string' ? mongo.subtitle : null,
    contentType: contentType as any,
    extractorVersion: mongo.extractorVersion ?? 0,
    metadata: (mongo.metadata as any) ?? {},
    contentHtml,
    contentText,
    articles,
    toc,
    friendlyUrl: mongo.friendlyUrl ?? null,
    sourceUrl: mongo.sourceUrl ?? null,
    fetchedAt: mongo.fetchedAt?.toISOString?.() ?? new Date().toISOString(),
    fromCache: overrides?.fromCache ?? true,
  };
  const hasRenderableContent = !isDocumentContentEmpty(doc);
  const contentUnavailableReason =
    overrides?.contentUnavailableReason ?? (hasRenderableContent ? null : 'saij_document_only_metadata');
  return { ...doc, hasRenderableContent, contentUnavailableReason };
};

const extractRelatedSumarioCodes = (rawPayload: any): string[] => {
  const abstractObj = (rawPayload as any)?.data
    ? safeParseJson((rawPayload as any).data as string) ?? (rawPayload as any).data
    : rawPayload;
  const content = abstractObj?.document?.content ?? abstractObj?.content ?? {};
  const related =
    content?.['sumarios-relacionados'] ??
    content?.sumariosRelacionados ??
    content?.sumarios_relacionados ??
    null;
  if (!related) return [];

  const values: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      values.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(related);

  return Array.from(
    new Set(
      values
        .map((v) => String(v).trim())
        .filter((v) => /^[A-Za-z]\d{6,8}$/.test(v))
    )
  );
};

const getRawHits = (raw: any): any[] =>
  (raw as any)?.searchResults?.documentResultList ??
  raw?.documentResultList ??
  raw?.hits ??
  raw?.resultados ??
  raw?.results ??
  [];

const resolveRelatedSumarioFallback = async (
  rawPayload: any
): Promise<{ contentType: 'sumario'; contentText: string; subtitle: string | null } | null> => {
  const codes = extractRelatedSumarioCodes(rawPayload);
  if (!codes.length) return null;

  const snippets: string[] = [];
  let subtitle: string | null = null;

  for (const code of codes.slice(0, 3)) {
    try {
      const { raw } = await client.search({
        r: `numero-sumario:${code}`,
        f: JURIS_SUMARIO_FACET,
        offset: 0,
        pageSize: 1,
      });
      const first = getRawHits(raw)[0];
      if (!first) continue;
      const mapped = mapSaijSearchHit(first, 'sumario');
      const text = typeof mapped.summary === 'string' ? mapped.summary.trim() : '';
      if (text && !snippets.includes(text)) snippets.push(text);
      if (!subtitle && mapped.subtitle) subtitle = mapped.subtitle;
    } catch (err) {
      logger.warn({ err, code }, 'Related sumario resolution failed');
    }
  }

  if (!snippets.length) return null;
  return {
    contentType: 'sumario',
    contentText: snippets.join('\n\n'),
    subtitle,
  };
};

const warnUnimplementedFilters = (filters: SaijSearchRequest['filters']) => {
  const unimplemented: Array<keyof typeof filters> = [
    'tipoNorma',
    'estadoVigencia',
    'titulo',
    'organismo',
    'tema',
    'fechaDesde',
    'fechaHasta',
    'idDoc',
  ];
  const provided = unimplemented.filter((f) => filters[f]);
  if (provided.length) {
    logger.warn({ filters: provided }, 'Filtros aún no implementados, se ignoran en query');
  }
};

export const SaijService = {
  async search(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    warnUnimplementedFilters(input.filters);
    console.log('DEBUG FLAG:', input.debug);

    const query = buildSaijQuery(input);
    const cacheKey = `saij-search:v2:${hashString(JSON.stringify(query))}`;

    if (!input.debug) {
      const cachedMem = cache.getSearch(query);
      if (cachedMem) {
        console.log('search cache hit: memory');
        return { ...cachedMem, query };
      }

      const cachedDb = await CacheService.getSearch(cacheKey);
      if (cachedDb) {
        console.log('search cache hit: mongo');
        const response = cachedDb as SaijSearchResponse;
        cache.setSearch(query, response);
        return { ...response, query };
      }
      console.log('search cache miss');
    } else {
      console.log('search cache skipped בגלל debug');
    }

    logger.info({ query }, 'Executing SAIJ search');
    const { raw, debug } = await client.search(query);

    logger.info(
      {
        queryObjectData: (raw as any)?.queryObjectData,
        totalSearchResults: (raw as any)?.searchResults?.totalSearchResults,
        hasDocumentResultList: Boolean((raw as any)?.searchResults?.documentResultList),
        documentResultListLength: (raw as any)?.searchResults?.documentResultList?.length ?? null,
        categoriesResultListLength: (raw as any)?.searchResults?.categoriesResultList?.length ?? null,
      },
      'SAIJ raw search debug'
    );

    const rawHits =
      (raw as any)?.searchResults?.documentResultList ??
      raw.documentResultList ??
      raw.hits ??
      raw.resultados ??
      raw.results ??
      [];

    const hits = rawHits.map((item: any) => mapSaijSearchHit(item, input.contentType));
    const response: SaijSearchResponse = {
      ok: true,
      query,
      total:
        (raw as any)?.searchResults?.totalSearchResults ??
        raw.total ??
        hits.length,
      hits,
      facets: raw.facets ?? raw.facetas ?? [],
    };

    if (input.debug) {
      response.debugInfo = {
        url: debug.url,
        status: debug.status,
        contentType: debug.contentType,
        rawTotalSearchResults:
          (raw as any)?.searchResults?.totalSearchResults ?? raw.total ?? null,
        rawDocumentResultListLength:
          (raw as any)?.searchResults?.documentResultList?.length ??
          raw.documentResultList?.length ??
          null,
      };
    } else {
      cache.setSearch(query, response);
      await CacheService.saveSearch(cacheKey, input, response, Math.floor(SEARCH_CACHE_TTL_MS / 1000));
    }
    return response;
  },

  async getDocumentByGuid(guid: string, opts?: { debug?: boolean }): Promise<SaijDocumentResponse> {
    if (!guid || guid.trim().length === 0) {
      throw new HttpError(400, 'invalid_guid', 'guid requerido');
    }

    const debug = opts?.debug ?? false;

    if (!debug) {
      const mem = cache.getDocument(guid);
      if (mem) {
        const payload = { ...(mem.payload as any), fromCache: true } as any;
        if (isCurrentExtractorVersion(payload) && hasRenderableDocumentContent(payload)) {
          return {
            ok: true,
            document: payload,
            debugInfo: { strategyUsed: 'cache' },
          };
        }
        logger.info({ guid }, 'Ignoring outdated/empty memory cache and refetching from SAIJ');
      }

      const mongo = await NormService.getCached(guid);
      if (mongo && mongo.expiresAt > new Date()) {
        const doc = buildDocumentFromMongo(mongo, { fromCache: true });
        if (isCurrentExtractorVersion(doc) && doc.hasRenderableContent) {
          cache.setDocument({ guid, payload: doc, fetchedAt: doc.fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
          return { ok: true, document: doc, debugInfo: { strategyUsed: 'cache' } };
        }
        logger.info({ guid }, 'Ignoring outdated/empty mongo cache and refetching from SAIJ');
      }
    }

    let strategyUsed: 'view-document' | 'friendly-url-fallback' | 'view-document+friendly-url-fallback' = 'view-document';
    let hadEmptyPrimaryContent = false;
    let fallbackAttempted = false;
    let fallbackSucceeded = false;
    let externalContentType: string | undefined;
    let externalUrl: string | undefined;

    try {
      const { raw, debug: debugInfo } = await client.fetchSaijDocumentByGuid(guid);
      externalContentType = debugInfo.contentType;
      externalUrl = debugInfo.url;
      let mapped = mapSaijDocument(raw, { guid });
      if (isDocumentContentEmpty(mapped)) {
        const relatedSumario = await resolveRelatedSumarioFallback(raw);
        if (relatedSumario) {
          mapped = {
            ...mapped,
            contentType: mapped.contentType === 'legislacion' ? relatedSumario.contentType : mapped.contentType,
            subtitle: mapped.subtitle || relatedSumario.subtitle || null,
            contentHtml: null,
            contentText: relatedSumario.contentText,
            articles: [],
            _contentSource: 'view-document.sumarios-relacionados',
          };
        }
      }
      const primaryRenderable = !isDocumentContentEmpty(mapped);

      if (primaryRenderable) {
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent: false,
          fallbackAttempted: false,
          fallbackSucceeded: false,
          viewDocumentHadRenderableContent: true,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: true,
        });
      }

      if (isDocumentContentEmpty(mapped) && (mapped.friendlyUrl || mapped.sourceUrl)) {
        hadEmptyPrimaryContent = true;
        fallbackAttempted = true;
        try {
          const fallbackUrl = mapped.friendlyUrl || mapped.sourceUrl!;
          const { html, debug: dbg } = await client.fetchFriendlyUrl(fallbackUrl);
          externalContentType = dbg.contentType;
          externalUrl = dbg.finalUrl ?? dbg.url;
          const fallbackDoc = mapSaijDocument({}, { guid, fallbackHtml: html, friendlyUrl: fallbackUrl });
          mapped = mergeDocumentContent(mapped, fallbackDoc);
          fallbackSucceeded = !isDocumentContentEmpty(mapped);
          strategyUsed = 'view-document+friendly-url-fallback';
          const fallbackReason: string | undefined =
            fallbackSucceeded ? undefined : detectBlockReason(dbg.htmlPreview) ?? 'html_without_extractable_main_content';
          if (fallbackReason) {
            logger.warn({ guid, fallbackReason }, 'Fallback HTML sin contenido útil');
          }
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent,
          fallbackAttempted,
          fallbackSucceeded,
          fallbackHttpStatus: dbg.status,
          fallbackContentType: dbg.contentType,
          fallbackFinalUrl: dbg.finalUrl ?? dbg.url,
          fallbackHtmlPreview: dbg.htmlPreview,
          fallbackReason,
          fallbackErrorName: undefined,
          fallbackErrorMessage: undefined,
          primaryHasMetadataOnly: true,
          contentUnavailableReason: fallbackSucceeded
            ? null
            : fallbackReason === 'fallback_fetch_failed' && dbg.status === 500
              ? 'saij_friendly_500'
                : fallbackReason ?? null,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      } catch (err) {
          logger.warn({ guid, err }, 'Fallback after empty content failed');
          const errStatus = (err as any)?.response?.status || (err as any)?.status;
          const reason =
          errStatus === 500
            ? 'saij_friendly_500'
            : errStatus === 504
              ? 'saij_timeout'
              : 'fallback_fetch_failed';
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent,
          fallbackAttempted,
            fallbackSucceeded: false,
            fallbackReason: reason,
            fallbackErrorName: (err as any)?.name,
            fallbackErrorMessage: (err as any)?.message,
            primaryHasMetadataOnly: true,
            contentUnavailableReason: reason,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      }
      }

      return await finalizeDocument(guid, mapped, raw, {
        debug,
        strategyUsed,
        externalContentType,
        externalUrl,
        hadEmptyPrimaryContent,
        fallbackAttempted,
        fallbackSucceeded,
      });
    } catch (error) {
      logger.warn({ guid, error }, 'view-document failed, trying friendly-url');
      strategyUsed = 'friendly-url-fallback';
      const fallbackReasonFromError = resolveUnavailableReason(error);

      // try fallback using friendly URL from cache (mongo)
      const mongo = await NormService.getCached(guid);
      const friendlyUrl = (mongo as any)?.friendlyUrl;
      if (!friendlyUrl) {
        if (mongo) {
          const doc = buildDocumentFromMongo(mongo, { fromCache: true, contentUnavailableReason: fallbackReasonFromError });
          return {
            ok: true,
            document: doc,
            debugInfo: debug
              ? {
                  strategyUsed: 'cache',
                  hadEmptyPrimaryContent: true,
                  contentUnavailableReason: doc.contentUnavailableReason,
                }
              : undefined,
          };
        }
        throw new HttpError(502, 'saij_document_unavailable', 'No se pudo resolver el documento desde SAIJ');
      }

      try {
        const { html, debug: dbg } = await client.fetchFriendlyUrl(friendlyUrl);
        externalContentType = dbg.contentType;
        externalUrl = dbg.finalUrl ?? dbg.url;
        const mapped = mapSaijDocument({}, { guid, fallbackHtml: html, friendlyUrl });
        const mergedDoc = mapped;
        const fbSucceeded = !isDocumentContentEmpty(mergedDoc);
        const fbReason: string | undefined = fbSucceeded
          ? undefined
          : detectBlockReason(dbg.htmlPreview) ?? 'html_without_extractable_main_content';
        return await finalizeDocument(guid, mergedDoc, {}, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent: true,
          fallbackAttempted: true,
          fallbackSucceeded: fbSucceeded,
          fallbackHttpStatus: dbg.status,
          fallbackContentType: dbg.contentType,
          fallbackFinalUrl: dbg.finalUrl ?? dbg.url,
          fallbackHtmlPreview: dbg.htmlPreview,
          fallbackReason: fbReason,
          fallbackErrorName: undefined,
          fallbackErrorMessage: undefined,
          primaryHasMetadataOnly: false,
          contentUnavailableReason:
            fbSucceeded || !fbReason
              ? null
              : fbReason === 'fallback_fetch_failed' && dbg.status === 500
                ? 'saij_friendly_500'
                : fbReason,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      } catch (fallbackError) {
        logger.error({ guid, fallbackError }, 'friendly-url fallback failed');
        if (mongo) {
          const doc = buildDocumentFromMongo(mongo, {
            fromCache: true,
            contentUnavailableReason: resolveUnavailableReason(fallbackError),
          });
          return {
            ok: true,
            document: doc,
            debugInfo: debug
              ? {
                  strategyUsed: 'cache',
                  hadEmptyPrimaryContent: true,
                  contentUnavailableReason: doc.contentUnavailableReason,
                }
              : undefined,
          };
        }
        throw new HttpError(502, 'saij_document_unavailable', 'No se pudo resolver el documento desde SAIJ');
      }
    }
  },

  async debugFriendlyUrl(guid: string) {
    if (!guid || guid.trim().length === 0) {
      throw new HttpError(400, 'invalid_guid', 'guid requerido');
    }

    const { raw } = await client.fetchSaijDocumentByGuid(guid);
    const abstractObj = (raw as any)?.data
      ? safeParseJson((raw as any).data as string) ?? (raw as any).data
      : raw;
    const metadata = abstractObj?.document?.metadata ?? abstractObj?.metadata ?? {};
    const friendlyMeta = metadata['friendly-url'] ?? metadata['friendly_url'];
    const subdomain = friendlyMeta?.subdomain as string | undefined;
    const description = friendlyMeta?.description as string | undefined;

    const candidates: string[] = [];
    if (subdomain && description) candidates.push(`https://www.saij.gob.ar/${subdomain}-${description}`);
    if (description) candidates.push(`https://www.saij.gob.ar/${description}`);
    if (friendlyMeta && typeof friendlyMeta === 'string') candidates.push(`https://www.saij.gob.ar/${friendlyMeta}`);

    const attempts: any[] = [];
    let success = false;
    for (const url of candidates) {
      try {
        const { html, debug } = await client.fetchFriendlyUrl(url);
        attempts.push({ url, status: debug.status, finalUrl: debug.finalUrl, contentType: debug.contentType, preview: debug.htmlPreview, success: true });
        success = true;
        return {
          ok: true,
          guid,
          constructedFriendlyUrl: url,
          friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
          attempts,
          bodyPreview: debug.htmlPreview,
        };
      } catch (err: any) {
        attempts.push({
          url,
          success: false,
          errorName: err?.name,
          errorMessage: err?.message,
          status: err?.response?.status ?? err?.status,
          finalUrl: err?.response?.request?.res?.responseUrl,
        });
      }
    }

    return {
      ok: true,
      guid,
      constructedFriendlyUrl: candidates[0] ?? null,
      friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
      attempts,
      success,
    };
  },
};

async function finalizeDocument(
  guid: string,
  mapped: any,
  rawPayload: any,
  debugParams: {
    debug: boolean;
    strategyUsed: 'cache' | 'view-document' | 'friendly-url-fallback' | 'view-document+friendly-url-fallback';
    externalContentType?: string;
    externalUrl?: string;
    hadEmptyPrimaryContent?: boolean;
    fallbackAttempted?: boolean;
    fallbackSucceeded?: boolean;
    fallbackHttpStatus?: number;
    fallbackContentType?: string;
    fallbackFinalUrl?: string;
    fallbackHtmlPreview?: string;
    fallbackReason?: string;
    fallbackErrorName?: string;
    fallbackErrorMessage?: string;
    contentUnavailableReason?: string | null;
    primaryHasMetadataOnly?: boolean;
    viewDocumentHadRenderableContent?: boolean;
    viewDocumentContentSource?: string | null;
    friendlyFallbackSkippedBecausePrimaryWasEnough?: boolean;
  }
): Promise<SaijDocumentResponse> {
  const expiresAt = new Date(Date.now() + DOCUMENT_CACHE_TTL_MS);
  const fetchedAt = new Date().toISOString();
  let contentUnavailableReason = debugParams.contentUnavailableReason ?? null;
  const hasRenderableContent = !isDocumentContentEmpty(mapped);
  const primaryTextWasRejectedAsMetadataOnly = Boolean((mapped as any)?._primaryTextWasRejectedAsMetadataOnly);
  const rejectedTextReason = (mapped as any)?._rejectedTextReason ?? null;
  if (!hasRenderableContent) {
    if (primaryTextWasRejectedAsMetadataOnly) {
      contentUnavailableReason = 'saij_metadata_only';
    } else if (!contentUnavailableReason) {
      contentUnavailableReason = 'saij_document_only_metadata';
    }
  }
  const safeSubtitle = typeof mapped.subtitle === 'string' ? mapped.subtitle : null;
  const rawViewDocumentContentSource = debugParams.viewDocumentContentSource ?? (mapped as any)?._contentSource ?? null;
  const viewDocumentContentSource =
    rawViewDocumentContentSource === 'view-document.articulo[]' ? 'articulo[]' : rawViewDocumentContentSource;
  const structuredArticleSourceUsed = Boolean((mapped as any)?._structuredArticleSourceUsed);
  const structuredArticlePath = (mapped as any)?._structuredArticlePath ?? null;
  const structuredArticleCount = (mapped as any)?._structuredArticleCount ?? 0;
  const docWithMeta = {
    ...mapped,
    subtitle: safeSubtitle,
    extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
    fetchedAt,
    fromCache: false,
    hasRenderableContent,
    contentUnavailableReason,
  };

  if (!debugParams.debug) {
    cache.setDocument({ guid, payload: docWithMeta, fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
    await NormService.save({
      guid,
      source: 'saij',
      extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
      contentType: mapped.contentType,
      title: mapped.title,
      subtitle: safeSubtitle,
      metadata: mapped.metadata,
      contentHtml: mapped.contentHtml ?? null,
      contentText: mapped.contentText ?? null,
      articles: mapped.articles,
      toc: mapped.toc,
      sourceUrl: mapped.sourceUrl ?? null,
      friendlyUrl: mapped.friendlyUrl ?? null,
      rawPayload,
      fetchedAt: new Date(fetchedAt),
      expiresAt,
    });
  }

  return {
    ok: true,
    document: docWithMeta,
    debugInfo: debugParams.debug
      ? {
          strategyUsed: debugParams.strategyUsed,
          externalContentType: debugParams.externalContentType,
          externalUrl: debugParams.externalUrl,
          hadEmptyPrimaryContent: debugParams.hadEmptyPrimaryContent ?? false,
          fallbackAttempted: debugParams.fallbackAttempted ?? false,
          fallbackSucceeded: debugParams.fallbackSucceeded ?? false,
          fallbackHttpStatus: debugParams.fallbackHttpStatus,
          fallbackContentType: debugParams.fallbackContentType,
          fallbackFinalUrl: debugParams.fallbackFinalUrl,
          fallbackHtmlPreview: debugParams.fallbackHtmlPreview,
          fallbackReason: debugParams.fallbackReason,
          fallbackErrorName: debugParams.fallbackErrorName,
          fallbackErrorMessage: debugParams.fallbackErrorMessage,
          primaryHasMetadataOnly: debugParams.primaryHasMetadataOnly ?? false,
          primaryTextWasRejectedAsMetadataOnly,
          rejectedTextReason,
          hasRenderableContent,
          contentUnavailableReason,
          viewDocumentHadRenderableContent: debugParams.viewDocumentHadRenderableContent ?? false,
          viewDocumentContentSource,
          articleCount: Array.isArray(mapped.articles) ? mapped.articles.length : 0,
          structuredArticleSourceUsed,
          structuredArticlePath,
          structuredArticleCount,
          friendlyFallbackSkippedBecausePrimaryWasEnough:
            debugParams.friendlyFallbackSkippedBecausePrimaryWasEnough ?? false,
        }
      : undefined,
  };
}
