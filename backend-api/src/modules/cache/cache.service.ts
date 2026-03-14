import { SearchCacheModel } from './cache.model';

export const CacheService = {
  async saveSearch(key: string, requestPayload: unknown, responsePayload: unknown, ttlSeconds: number) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await SearchCacheModel.findOneAndUpdate(
      { key },
      { key, requestPayload, responsePayload, expiresAt, createdAt: new Date() },
      { upsert: true, new: true }
    );
  },

  async getSearch(key: string) {
    const record = await SearchCacheModel.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    return record?.responsePayload;
  },
};
