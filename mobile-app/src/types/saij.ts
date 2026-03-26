export type SaijJurisdiction =
  | { kind: "todas" }
  | { kind: "nacional" }
  | { kind: "internacional" }
  | { kind: "provincial"; provincia: string };

export type SaijLegislationSubtype =
  | "todas"
  | "normas_internacionales"
  | "normativa_comunitaria"
  | "leyes_ratificatorias_tratados"
  | "constitucion"
  | "constitucion_nacional"
  | "constitucion_provincial"
  | "codigo"
  | "codigo_nacional"
  | "codigo_provincial"
  | "leyes_nacionales_vigentes"
  | "leyes_provinciales_vigentes"
  | "nuevas_leyes_sancionadas"
  | "leyes_vetadas"
  | "decretos_nacionales_vigentes"
  | "dnu"
  | "resolucion_afip"
  | "resolucion_igj"
  | "resolucion_aabe"
  | "decreto"
  | "decreto_simple"
  | "texto_ordenado_decreto";

export type SaijSearchFilters = {
  textoEnNorma?: string;
  numeroNorma?: string;
  tipoNorma?: string;
  jurisdiccion?: SaijJurisdiction;
  facetFecha?: string;
  facetJurisdiccion?: string;
  facetEstadoVigencia?: string;
  facetTema?: string;
  facetOrganismo?: string;
};

export type SaijSearchRequest = {
  contentType: "legislacion" | "jurisprudencia" | "fallo" | "sumario" | "dictamen" | "doctrina" | "todo";
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

export type SaijFacetNode = {
  facetName: string;
  facetHits: number;
  currentDepth?: number;
  hasMoreChildren?: boolean;
  facetChildren?: SaijFacetNode[];
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
  facets: SaijFacetNode[];
};

export type SaijArticle = {
  number: string | null;
  title: string | null;
  text: string;
  normasQueModifica?: SaijLinkedDocumentRef[];
  normasComplementarias?: SaijLinkedDocumentRef[];
  observaciones?: SaijLinkedDocumentRef[];
  relatedContents?: SaijLinkedDocumentRef[];
};

export type SaijLinkedDocumentRef = {
  title: string;
  subtitle?: string | null;
  contentTypeHint?:
    | "legislacion"
    | "jurisprudencia"
    | "fallo"
    | "sumario"
    | "dictamen"
    | "doctrina"
    | "todo"
    | "unknown";
  guid?: string | null;
  sourceUrl?: string | null;
  url: string;
};

export type SaijDocument = {
  guid: string;
  title: string;
  subtitle: string | null;
  contentType: string;
  documentSubtype?: string | null;
  estadoVigencia?: string | null;
  tribunal?: string | null;
  fechaSentencia?: string | null;
  autor?: string | null;
  organismo?: string | null;
  metadata: any;
  contentHtml: string | null;
  contentText: string | null;
  headerText?: string | null;
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
  normasQueModifica?: SaijLinkedDocumentRef[];
  normasComplementarias?: SaijLinkedDocumentRef[];
  observaciones?: SaijLinkedDocumentRef[];
  relatedFallos?: SaijLinkedDocumentRef[];
  relatedContents?: SaijLinkedDocumentRef[];
  fetchedAt: string;
  fromCache: boolean;
  hasRenderableContent: boolean;
  contentUnavailableReason: string | null;
};

export type SaijDocumentResponse = {
  ok: boolean;
  document: SaijDocument;
};

