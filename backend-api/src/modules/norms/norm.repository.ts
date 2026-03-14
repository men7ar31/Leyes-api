import { NormCacheDocument, NormCacheModel } from './norm.model';

export const NormRepository = {
  findByGuid(guid: string) {
    return NormCacheModel.findOne({ guid }).lean<NormCacheDocument>();
  },

  upsert(doc: Partial<NormCacheDocument>) {
    if (!doc.guid) throw new Error('guid is required');
    return NormCacheModel.findOneAndUpdate({ guid: doc.guid }, doc, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  },
};
