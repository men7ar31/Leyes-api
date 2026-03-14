import mongoose, { Document, Schema } from 'mongoose';

export interface SearchCacheDocument extends Document {
  key: string;
  requestPayload: unknown;
  responsePayload: unknown;
  createdAt: Date;
  expiresAt: Date;
}

const SearchCacheSchema = new Schema<SearchCacheDocument>({
  key: { type: String, required: true, unique: true },
  requestPayload: { type: Schema.Types.Mixed, required: true },
  responsePayload: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

SearchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SearchCacheModel = mongoose.model<SearchCacheDocument>('SearchCache', SearchCacheSchema);
