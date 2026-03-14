import { logger } from '../../utils/logger';
import { hashString } from '../../utils/hash';
import { CacheService } from '../cache/cache.service';
import { SaijCache } from './saij.cache';
import { SaijClient } from './saij.client';
import { buildSaijQuery } from './saij.query-builder';
import { mapSaijSearchHit, mapSaijDocument, isDocumentContentEmpty, mergeDocumentContent } from './saij.mapper';
import { SaijSearchRequest, SaijSearchResponse, SaijDocumentResponse } from './saij.types';
import { SEARCH_CACHE_TTL_MS, DOCUMENT_CACHE_TTL_MS } from './saij.constants';
import { HttpError } from '../../utils/httpError';
import { NormService } from '../norms/norm.service';

const cache = new SaijCache();
const client = new SaijClient();

const safeParseJson = (payload?: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
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
        return {
          ok: true,
          document: { ...(mem.payload as any), fromCache: true } as any,
          debugInfo: { strategyUsed: 'cache' },
        };
      }

      const mongo = await NormService.getCached(guid);
      if (mongo && mongo.expiresAt > new Date()) {
        const doc = {
          guid: mongo.guid,
          title: mongo.title,
          subtitle: mongo.subtitle ?? null,
          contentType: mongo.contentType as any,
          metadata: (mongo.metadata as any) ?? {},
          contentHtml: mongo.contentHtml ?? null,
          contentText: mongo.contentText ?? null,
          articles: (mongo.articles as any[]) ?? [],
          toc: (mongo.toc as any[]) ?? [],
          friendlyUrl: mongo.friendlyUrl ?? null,
          sourceUrl: mongo.sourceUrl ?? null,
          fetchedAt: mongo.fetchedAt.toISOString(),
          fromCache: true,
          hasRenderableContent: !(
            (!mongo.contentHtml || mongo.contentHtml.trim().length === 0) &&
            (!mongo.contentText || mongo.contentText.trim().length === 0) &&
            (!mongo.articles || mongo.articles.length === 0)
          ),
          contentUnavailableReason: null,
        };
        cache.setDocument({ guid, payload: doc, fetchedAt: doc.fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
        return { ok: true, document: doc, debugInfo: { strategyUsed: 'cache' } };
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

      // try fallback using friendly URL from cache (mongo)
      const mongo = await NormService.getCached(guid);
      const friendlyUrl = (mongo as any)?.friendlyUrl;
      if (!friendlyUrl) {
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
  if (!hasRenderableContent && !contentUnavailableReason) {
    contentUnavailableReason = 'saij_document_only_metadata';
  }
  const docWithMeta = { ...mapped, fetchedAt, fromCache: false, hasRenderableContent, contentUnavailableReason };

  if (!debugParams.debug) {
    cache.setDocument({ guid, payload: docWithMeta, fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
    await NormService.save({
      guid,
      source: 'saij',
      contentType: mapped.contentType,
      title: mapped.title,
      subtitle: mapped.subtitle ?? null,
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
          hasRenderableContent,
          contentUnavailableReason,
          viewDocumentHadRenderableContent: debugParams.viewDocumentHadRenderableContent ?? false,
          viewDocumentContentSource: debugParams.viewDocumentContentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough:
            debugParams.friendlyFallbackSkippedBecausePrimaryWasEnough ?? false,
        }
      : undefined,
  };
}
