import { z } from 'zod';

export const ContentTypeEnum = z.enum([
  'legislacion',
  'jurisprudencia',
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
  facetFecha: z.string().trim().optional(),
  facetJurisdiccion: z.string().trim().optional(),
  facetEstadoVigencia: z.string().trim().optional(),
  facetTema: z.string().trim().optional(),
  facetOrganismo: z.string().trim().optional(),
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
  friendlyUrlParts?: {
    raw?: any;
    subdomain?: string;
    description?: string;
  };
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

export type SaijArticle = {
  number: string;
  title: string | null;
  text: string;
  normasQueModifica?: SaijLinkedDocumentRef[];
  normasComplementarias?: SaijLinkedDocumentRef[];
  observaciones?: SaijLinkedDocumentRef[];
  relatedContents?: SaijLinkedDocumentRef[];
};

export type SaijTocItem = {
  label: string;
  anchor?: string;
};

export type SaijLinkedDocumentRef = {
  title: string;
  subtitle?: string | null;
  contentTypeHint?: SaijContentType | 'todo' | 'unknown';
  guid?: string | null;
  sourceUrl?: string | null;
  url: string;
};

export type SaijDocumentRaw = Record<string, unknown>;

export type SaijResolvedDocument = {
  guid: string;
  title: string;
  subtitle?: string | null;
  contentType: SaijContentType;
  numeroNorma?: string | null;
  tipoNorma?: string | null;
  smartCitation?: {
    numero?: string | null;
    tipo?: string | null;
    nombre?: string | null;
  } | null;
  documentSubtype?: string | null;
  estadoVigencia?: string | null;
  tribunal?: string | null;
  fechaSentencia?: string | null;
  autor?: string | null;
  organismo?: string | null;
  metadata: Record<string, unknown>;
  contentHtml?: string | null;
  contentText?: string | null;
  headerText?: string | null;
  articles: SaijArticle[];
  toc: SaijTocItem[];
  friendlyUrl?: string | null;
  sourceUrl?: string | null;
  attachment?: {
    guid?: string | null;
    fileName?: string | null;
    url?: string | null;
    fallbackUrl?: string | null;
  } | null;
  normasQueModifica?: SaijLinkedDocumentRef[];
  normasComplementarias?: SaijLinkedDocumentRef[];
  observaciones?: SaijLinkedDocumentRef[];
  relatedFallos?: SaijLinkedDocumentRef[];
  relatedContents?: SaijLinkedDocumentRef[];
  fetchedAt: string;
  fromCache: boolean;
  hasRenderableContent: boolean;
  contentUnavailableReason?: string | null;
  friendlyUrlParts?: {
    raw?: any;
    subdomain?: string;
    description?: string;
  };
};

export type SaijDocumentResponse = {
  ok: boolean;
  document: SaijResolvedDocument;
  debugInfo?: {
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
    primaryHasMetadataOnly?: boolean;
    primaryTextWasRejectedAsMetadataOnly?: boolean;
    rejectedTextReason?: string | null;
    hasRenderableContent?: boolean;
    contentUnavailableReason?: string | null;
    viewDocumentHadRenderableContent?: boolean;
    viewDocumentContentSource?: string | null;
    articleCount?: number;
    structuredArticleSourceUsed?: boolean;
    structuredArticlePath?: string | null;
    structuredArticleCount?: number;
    friendlyFallbackSkippedBecausePrimaryWasEnough?: boolean;
  };
};
