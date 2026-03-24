export type SaijJurisdiction =
  | { kind: "todas" }
  | { kind: "nacional" }
  | { kind: "internacional" }
  | { kind: "provincial"; provincia: string };

export type SaijSearchFilters = {
  textoEnNorma?: string;
  numeroNorma?: string;
  jurisdiccion?: SaijJurisdiction;
};

export type SaijSearchRequest = {
  contentType: "legislacion" | "fallo" | "sumario" | "dictamen" | "doctrina" | "todo";
  filters: SaijSearchFilters;
  offset: number;
  pageSize: number;
};

export type SaijSearchHit = {
  guid: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  contentType: string;
  fecha: string | null;
  estado: string | null;
  jurisdiccion: string | null;
  fuente: string;
  friendlyUrl: string | null;
  sourceUrl: string | null;
  friendlyUrlParts?: {
    raw?: any;
    subdomain?: string | null;
    description?: string | null;
  } | null;
};

export type SaijSearchResponse = {
  ok: boolean;
  query: {
    r: string;
    f: string;
    offset: number;
    pageSize: number;
  };
  total: number;
  hits: SaijSearchHit[];
  facets: any[];
};

export type SaijArticle = {
  number: string | null;
  title: string | null;
  text: string;
};

export type SaijDocument = {
  guid: string;
  title: string;
  subtitle: string | null;
  contentType: string;
  metadata: any;
  contentHtml: string | null;
  contentText: string | null;
  articles: SaijArticle[];
  toc: any[];
  friendlyUrl: string | null;
  sourceUrl: string | null;
  attachment?: {
    guid?: string | null;
    fileName?: string | null;
    url?: string | null;
    fallbackUrl?: string | null;
  } | null;
  relatedFallos?: Array<{
    title: string;
    subtitle?: string | null;
    guid?: string | null;
    sourceUrl?: string | null;
    url: string;
  }>;
  relatedContents?: Array<{
    title: string;
    subtitle?: string | null;
    contentTypeHint?: "legislacion" | "fallo" | "sumario" | "dictamen" | "doctrina" | "todo" | "unknown";
    guid?: string | null;
    sourceUrl?: string | null;
    url: string;
  }>;
  fetchedAt: string;
  fromCache: boolean;
  hasRenderableContent: boolean;
  contentUnavailableReason: string | null;
};

export type SaijDocumentResponse = {
  ok: boolean;
  document: SaijDocument;
};
