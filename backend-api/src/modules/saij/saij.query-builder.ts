import { SaijSearchRequest, SaijQuery, SaijContentType } from './saij.types';
import { DEFAULT_PAGE_SIZE } from './saij.constants';

const BASE_FACETS = [
  'Total',
  'Tipo de Documento',
  'Fecha',
  'Organismo',
  'Publicación',
  'Tema',
  'Estado de Vigencia',
  'Autor',
  'Jurisdicción',
];

const CONTENT_TYPE_FACETS: Record<SaijContentType, string | null> = {
  legislacion: 'Tipo de Documento/Legislación',
  fallo: 'Tipo de Documento/Jurisprudencia/Fallo',
  sumario: 'Tipo de Documento/Jurisprudencia/Sumario',
  dictamen: 'Tipo de Documento/Dictamen',
  doctrina: 'Tipo de Documento/Doctrina',
  todo: null,
};

export const buildSaijRawQuery = (input: SaijSearchRequest): string => {
  const rParts: string[] = [];

  if (input.filters.numeroNorma) {
    rParts.push(`numero-norma:${input.filters.numeroNorma}`);
  }

  if (input.filters.textoEnNorma) {
    const searchTerm = input.filters.textoEnNorma;
    // En jurisprudencia/fallos SAIJ responde con titulo:, no con texto:
    const field = input.contentType === 'fallo' ? 'titulo' : 'texto';
    rParts.push(`${field}: ${searchTerm}`);
  }

  return rParts.join(' ').trim();
};

export const buildSaijFacets = (input: SaijSearchRequest): string => {
  const facets = [...BASE_FACETS];

  // Tipo de documento facet
  const contentFacet = CONTENT_TYPE_FACETS[input.contentType];
  if (contentFacet) {
    const idx = facets.indexOf('Tipo de Documento');
    if (idx >= 0) facets[idx] = contentFacet;
    else facets.push(contentFacet);
  }

  // Jurisdicción facet
  const jurisdiccion = input.filters.jurisdiccion;
  if (jurisdiccion) {
    const idx = facets.indexOf('Jurisdicción');
    let value = 'Jurisdicción';
    if (jurisdiccion.kind === 'provincial' && jurisdiccion.provincia) {
      value = `Jurisdicción/Local/${jurisdiccion.provincia}`;
    } else if (jurisdiccion.kind === 'nacional') {
      value = 'Jurisdicción/Nacional';
    } else if (jurisdiccion.kind === 'internacional') {
      value = 'Jurisdicción/Internacional';
    }
    if (idx >= 0) facets[idx] = value;
    else facets.push(value);
  }

  return facets.join('|');
};

export const buildSaijQuery = (input: SaijSearchRequest): SaijQuery => {
  const r = buildSaijRawQuery(input);
  const f = buildSaijFacets(input);

  return {
    r,
    f,
    offset: input.offset ?? 0,
    pageSize: input.pageSize ?? DEFAULT_PAGE_SIZE,
  };
};
