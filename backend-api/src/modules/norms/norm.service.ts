import { NormRepository } from './norm.repository';
import { NormCacheDocument } from './norm.model';

export const NormService = {
  async getCached(guid: string) {
    return NormRepository.findByGuid(guid);
  },

  async save(doc: Partial<NormCacheDocument>) {
    return NormRepository.upsert(doc);
  },
};
