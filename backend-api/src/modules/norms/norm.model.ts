import mongoose, { Document, Schema } from 'mongoose';

export interface NormCacheDocument extends Document {
  guid: string;
  source: 'saij';
  extractorVersion?: number;
  contentType: string;
  title: string;
  subtitle?: string | null;
  metadata?: Record<string, unknown>;
  contentHtml?: string | null;
  contentText?: string | null;
  articles?: unknown[];
  toc?: unknown[];
  sourceUrl?: string | null;
  attachment?: unknown;
  relatedFallos?: unknown[];
  friendlyUrl?: string | null;
  rawPayload?: unknown;
  fetchedAt: Date;
  expiresAt: Date;
  queryHashes?: string[];
}

const NormCacheSchema = new Schema<NormCacheDocument>({
  guid: { type: String, required: true, unique: true },
  source: { type: String, required: true, default: 'saij' },
  extractorVersion: Number,
  contentType: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: String,
  metadata: Schema.Types.Mixed,
  contentHtml: String,
  contentText: String,
  articles: [Schema.Types.Mixed],
  toc: [Schema.Types.Mixed],
  sourceUrl: String,
  attachment: Schema.Types.Mixed,
  relatedFallos: [Schema.Types.Mixed],
  friendlyUrl: String,
  rawPayload: Schema.Types.Mixed,
  fetchedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  queryHashes: [String],
});

NormCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NormCacheModel = mongoose.model<NormCacheDocument>('NormCache', NormCacheSchema);
