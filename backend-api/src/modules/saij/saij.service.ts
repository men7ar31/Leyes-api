import { logger } from '../../utils/logger';
import { hashString } from '../../utils/hash';
import { CacheService } from '../cache/cache.service';
import { SaijCache } from './saij.cache';
import { SaijClient } from './saij.client';
import { buildSaijQuery } from './saij.query-builder';
import { mapSaijSearchHit } from './saij.mapper';
import { SaijSearchRequest, SaijSearchResponse } from './saij.types';
import { SEARCH_CACHE_TTL_MS } from './saij.constants';

const cache = new SaijCache();
const client = new SaijClient();

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
};
