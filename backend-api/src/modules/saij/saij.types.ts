import { z } from 'zod';

export const ContentTypeEnum = z.enum([
  'legislacion',
  'fallo',
  'sumario',
  'dictamen',
  'doctrina',
  'todo',
]);
export type SaijContentType = z.infer<typeof ContentTypeEnum>;

export const JurisdiccionSchema = z.object({
  kind: z.enum(['todas', 'nacional', 'internacional', 'provincial']).default('todas'),
  provincia: z.string().trim().optional(),
});
export type SaijJurisdiccion = z.infer<typeof JurisdiccionSchema>;

export const SearchFiltersSchema = z.object({
  numeroNorma: z.string().trim().optional(),
  tipoNorma: z.string().trim().optional(),
  jurisdiccion: JurisdiccionSchema.optional(),
  estadoVigencia: z.string().trim().optional(),
  titulo: z.string().trim().optional(),
  organismo: z.string().trim().optional(),
  tema: z.string().trim().optional(),
  textoEnNorma: z.string().trim().optional(),
  fechaDesde: z.string().trim().optional(),
  fechaHasta: z.string().trim().optional(),
  idDoc: z.string().trim().optional(),
});
export type SaijSearchFilters = z.infer<typeof SearchFiltersSchema>;

export const SearchRequestSchema = z.object({
  contentType: ContentTypeEnum.default('legislacion'),
  filters: SearchFiltersSchema.default({}),
  offset: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(50).default(20),
  debug: z.boolean().optional(),
});
export type SaijSearchRequest = z.infer<typeof SearchRequestSchema>;

export type SaijQuery = {
  r: string;
  f: string;
  offset: number;
  pageSize: number;
};

export type SaijSearchHitRaw = {
  uuid?: string;
  guid?: string;
  id?: string;
  documentAbstract?: string;
  metadata?: Record<string, unknown>;
  documentContentType?: string;
  [key: string]: unknown;
};

export type SaijSearchResponseRaw = {
  total?: number;
  documentResultList?: SaijSearchHitRaw[];
  hits?: SaijSearchHitRaw[];
  resultados?: SaijSearchHitRaw[];
  results?: SaijSearchHitRaw[];
  facets?: unknown[];
  facetas?: unknown[];
};

export type SaijSearchHit = {
  guid: string;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  contentType: SaijContentType;
  fecha?: string | null;
  estado?: string | null;
  jurisdiccion?: string | null;
  fuente?: string | null;
  friendlyUrl?: string | null;
  sourceUrl?: string | null;
  raw?: unknown;
};

export type SaijSearchResponse = {
  ok: boolean;
  query: SaijQuery;
  total: number;
  hits: SaijSearchHit[];
  facets: unknown[];
  debugInfo?: {
    url: string;
    status: number;
    contentType: string;
    rawTotalSearchResults?: number | null;
    rawDocumentResultListLength?: number | null;
  };
};
