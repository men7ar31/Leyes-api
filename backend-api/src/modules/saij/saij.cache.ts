import NodeCache from 'node-cache';
import { logger } from '../../utils/logger';
import { SaijQuery, SaijSearchResponse } from './saij.types';

type DocumentCacheEntry = {
  guid: string;
  payload: unknown;
  fetchedAt: string;
};

export class SaijCache {
  private memory: NodeCache;

  constructor() {
    this.memory = new NodeCache({ stdTTL: 600, checkperiod: 120 });
  }

  makeSearchKey(query: SaijQuery) {
    return JSON.stringify(query);
  }

  getSearch(query: SaijQuery): SaijSearchResponse | undefined {
    const key = this.makeSearchKey(query);
    return this.memory.get<SaijSearchResponse>(key);
  }

  setSearch(query: SaijQuery, response: SaijSearchResponse) {
    const key = this.makeSearchKey(query);
    this.memory.set(key, response, 600);
  }

  getDocument(guid: string): DocumentCacheEntry | undefined {
    return this.memory.get<DocumentCacheEntry>(`doc:${guid}`);
  }

  setDocument(entry: DocumentCacheEntry, ttlSeconds = 600) {
    logger.debug({ guid: entry.guid }, 'Caching document in memory');
    this.memory.set(`doc:${entry.guid}`, entry, ttlSeconds);
  }
}
