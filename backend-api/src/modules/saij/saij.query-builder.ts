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

type BaseFacetName =
  | 'Tipo de Documento'
  | 'Fecha'
  | 'Organismo'
  | 'Publicación'
  | 'Tema'
  | 'Estado de Vigencia'
  | 'Autor'
  | 'Jurisdicción';

const CONTENT_TYPE_FACETS: Record<SaijContentType, string | null> = {
  legislacion: 'Tipo de Documento/Legislación',
  jurisprudencia: 'Tipo de Documento/Jurisprudencia',
  fallo: 'Tipo de Documento/Jurisprudencia/Fallo',
  sumario: 'Tipo de Documento/Jurisprudencia/Sumario',
  dictamen: 'Tipo de Documento/Dictamen',
  doctrina: 'Tipo de Documento/Doctrina',
  todo: null,
};

const isJurisprudenceLikeContentType = (contentType: SaijContentType) =>
  contentType === 'jurisprudencia' || contentType === 'fallo' || contentType === 'sumario';

type LegislationSubtypeConfig = {
  contentFacet: string;
  overrides?: Partial<Record<BaseFacetName, string>>;
};

const LEGISLATION_SUBTYPE_FACETS: Record<string, LegislationSubtypeConfig> = {
  normas_internacionales: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Tratado',
  },
  normativa_comunitaria: {
    contentFacet: 'Tipo de Documento/Legislación/Resolución/Resolución Mercosur',
  },
  leyes_ratificatorias_tratados: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Tratado',
    overrides: {
      'Jurisdicción': 'Jurisdicción/Nacional',
    },
  },
  constitucion: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Constitución',
  },
  constitucion_nacional: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Constitución',
    overrides: {
      'Jurisdicción': 'Jurisdicción/Nacional',
    },
  },
  constitucion_provincial: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Constitución',
    overrides: {
      'Jurisdicción': 'Jurisdicción/Local',
    },
  },
  codigo: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Código',
  },
  codigo_nacional: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Código',
    overrides: {
      'Jurisdicción': 'Jurisdicción/Nacional',
    },
  },
  codigo_provincial: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Código',
    overrides: {
      'Jurisdicción': 'Jurisdicción/Local',
    },
  },
  leyes_nacionales_vigentes: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Ley',
    overrides: {
      'Estado de Vigencia': 'Estado de Vigencia/Vigente, de alcance general',
      'Jurisdicción': 'Jurisdicción/Nacional',
    },
  },
  leyes_provinciales_vigentes: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Ley',
    overrides: {
      'Estado de Vigencia': 'Estado de Vigencia/Vigente, de alcance general',
      'Jurisdicción': 'Jurisdicción/Local',
    },
  },
  nuevas_leyes_sancionadas: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Ley',
    overrides: {
      'Estado de Vigencia': 'Estado de Vigencia/Vigente, de alcance general',
    },
  },
  leyes_vetadas: {
    contentFacet: 'Tipo de Documento/Legislación/Ley/Ley',
    overrides: {
      'Estado de Vigencia': 'Estado de Vigencia/Vetada',
    },
  },
  decreto: {
    contentFacet: 'Tipo de Documento/Legislación/Decreto',
  },
  decretos_nacionales_vigentes: {
    contentFacet: 'Tipo de Documento/Legislación/Decreto/Decreto',
    overrides: {
      'Estado de Vigencia': 'Estado de Vigencia/Vigente, de alcance general',
      'Jurisdicción': 'Jurisdicción/Nacional',
    },
  },
  decreto_simple: {
    contentFacet: 'Tipo de Documento/Legislación/Decreto/Decreto',
  },
  dnu: {
    contentFacet: 'Tipo de Documento/Legislación/Decreto/Decreto de Necesidad y Urgencia',
  },
  texto_ordenado_decreto: {
    contentFacet: 'Tipo de Documento/Legislación/Decreto/Texto Ordenado Decreto',
  },
  resolucion_afip: {
    contentFacet: 'Tipo de Documento/Legislación/Resolución',
    overrides: {
      Organismo: 'Organismo/AFIP',
    },
  },
  resolucion_igj: {
    contentFacet: 'Tipo de Documento/Legislación/Resolución',
    overrides: {
      Organismo: 'Organismo/IGJ',
    },
  },
  resolucion_aabe: {
    contentFacet: 'Tipo de Documento/Legislación/Resolución',
    overrides: {
      Organismo: 'Organismo/AABE',
    },
  },
};

const normalizeLegislationSubtype = (value?: string) => {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n');

  if (!normalized || normalized === 'todas' || normalized === 'todos' || normalized === 'all') return null;
  if (normalized === 'dnu') return 'dnu';
  if (normalized === 'decreto_de_necesidad_y_urgencia' || normalized === 'decreto_necesidad_urgencia') return 'dnu';
  if (normalized === 'texto_ordenado' || normalized === 'texto_ordenado_decreto') return 'texto_ordenado_decreto';
  if (normalized === 'decreto_simple' || normalized === 'decreto') {
    return normalized === 'decreto_simple' ? 'decreto_simple' : 'decreto';
  }

  const aliases: Record<string, string> = {
    constituciones: 'constitucion',
    constitucion: 'constitucion',
    constitucion_nacional: 'constitucion_nacional',
    constituciones_nacionales: 'constitucion_nacional',
    constitucion_provincial: 'constitucion_provincial',
    constituciones_provinciales: 'constitucion_provincial',
    codigos: 'codigo',
    codigo: 'codigo',
    codigo_nacional: 'codigo_nacional',
    codigos_nacionales: 'codigo_nacional',
    codigo_provincial: 'codigo_provincial',
    codigos_provinciales: 'codigo_provincial',
    normas_internacionales: 'normas_internacionales',
    normas_internacionales_pactos_convenios_declaraciones: 'normas_internacionales',
    normativa_comunitaria: 'normativa_comunitaria',
    leyes_ratificatorias_tratados: 'leyes_ratificatorias_tratados',
    leyes_ratificatorias_de_tratados_internacionales: 'leyes_ratificatorias_tratados',
    leyes_nacionales_vigentes: 'leyes_nacionales_vigentes',
    leyes_provinciales_vigentes: 'leyes_provinciales_vigentes',
    nuevas_leyes_sancionadas: 'nuevas_leyes_sancionadas',
    leyes_vetadas: 'leyes_vetadas',
    decretos_nacionales_vigentes: 'decretos_nacionales_vigentes',
    resoluciones_generales_afip: 'resolucion_afip',
    resolucion_afip: 'resolucion_afip',
    resoluciones_igj: 'resolucion_igj',
    resolucion_igj: 'resolucion_igj',
    resoluciones_aabe: 'resolucion_aabe',
    resolucion_aabe: 'resolucion_aabe',
  };

  return aliases[normalized] ?? null;
};

const setFacet = (facets: string[], baseFacet: BaseFacetName, value: string) => {
  const idx = facets.indexOf(baseFacet);
  if (idx >= 0) facets[idx] = value;
  else facets.push(value);
};

const normalizeFacetValue = (baseFacet: BaseFacetName, value?: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) return trimmed;
  return `${baseFacet}/${trimmed}`;
};

const buildNumeroNormaTerms = (rawValue?: string): string[] => {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];

  // Soporta formato decreto/ley "70/2023" sin romper SAIJ.
  // En vez de "numero-norma:70/2023" (puede devolver 500),
  // usa "numero-norma:70 fecha:2023".
  const slashMatch = raw.match(/^([0-9][0-9.\-]*)\s*\/\s*(\d{2,4})$/);
  if (slashMatch) {
    const numero = slashMatch[1].replace(/[^\d]/g, '');
    const anio = slashMatch[2].trim();
    const terms: string[] = [];
    if (numero) terms.push(`numero-norma:${numero}`);
    if (anio) terms.push(`fecha:${anio}`);
    return terms;
  }

  const numeroSolo = raw.replace(/[^\d]/g, '');
  if (numeroSolo) return [`numero-norma:${numeroSolo}`];

  return [];
};

const normalizeSearchHeuristicTerm = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const shouldPreferNormTitleSearch = (rawValue?: string) => {
  const normalized = normalizeSearchHeuristicTerm(rawValue);
  if (!normalized) return false;

  const words = normalized.split(' ').filter(Boolean);
  if (words.length > 8) return false;
  if (/[.:;]/.test(rawValue || '')) return false;

  const hasNormKeyword = [
    'ley',
    'codigo',
    'decreto',
    'dnu',
    'resolucion',
    'constitucion',
    'estatuto',
    'regimen',
    'convenio',
    'contrato de trabajo',
    'procedimiento',
  ].some((token) => normalized.includes(token));

  const hasNormNumber = /\b\d{2,7}(?:\s*\/\s*\d{2,4})?\b/.test(normalized);
  return hasNormKeyword || hasNormNumber;
};

const toSaijTokenizedTerm = (value: string) => value.trim().replace(/\s+/g, '?');

const splitSearchWords = (value: string) =>
  String(value || '')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean);

const buildFieldAllWordsExpression = (field: string, rawValue: string) => {
  const tokens = splitSearchWords(rawValue);
  if (!tokens.length) return '';
  if (tokens.length === 1) return `${field}:${toSaijTokenizedTerm(tokens[0])}`;
  return tokens.map((token) => `${field}:${toSaijTokenizedTerm(token)}`).join(' y ');
};

const uniqueNonEmpty = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const buildContextualSearchExpression = (input: SaijSearchRequest, rawValue: string) => {
  const searchTerm = toSaijTokenizedTerm(rawValue);
  if (!searchTerm) return '';

  const jurisprudenceSubtype = String(input.filters.tipoNorma || '').trim().toLowerCase();

  if (input.contentType === 'fallo') {
    return buildFieldAllWordsExpression('titulo', rawValue);
  }

  if (input.contentType === 'sumario') {
    return `tema:${searchTerm}`;
  }

  if (input.contentType === 'doctrina') {
    return `tema:${searchTerm}`;
  }

  if (input.contentType === 'dictamen') {
    return `tema:${searchTerm}`;
  }

  if (input.contentType === 'jurisprudencia') {
    if (jurisprudenceSubtype === 'fallo') {
      return buildFieldAllWordsExpression('titulo', rawValue);
    }
    if (jurisprudenceSubtype === 'sumario') {
      return `tema:${searchTerm}`;
    }
    return uniqueNonEmpty([`titulo:${searchTerm}`, `tema:${searchTerm}`]).join(' OR ');
  }

  if (input.contentType === 'todo') {
    return uniqueNonEmpty([`titulo:${searchTerm}`, `tema:${searchTerm}`, `texto:${searchTerm}`]).join(' OR ');
  }

  if (input.contentType === 'legislacion') {
    if (shouldPreferNormTitleSearch(rawValue)) {
      return uniqueNonEmpty([`titulo:${searchTerm}`, `texto:${searchTerm}`]).join(' OR ');
    }
    return `texto:${searchTerm}`;
  }

  return `texto:${searchTerm}`;
};

export const buildSaijRawQuery = (input: SaijSearchRequest): string => {
  const rParts: string[] = [];

  if (input.filters.numeroNorma) {
    rParts.push(...buildNumeroNormaTerms(input.filters.numeroNorma));
  }

  if (input.filters.textoEnNorma) {
    const rawSearchTerm = input.filters.textoEnNorma.trim();
    const contextualExpression = buildContextualSearchExpression(input, rawSearchTerm);
    if (contextualExpression) {
      rParts.push(contextualExpression);
    }
  }

  return rParts.join(' ').trim();
};

export const buildSaijFacets = (input: SaijSearchRequest): string => {
  const facets = [...BASE_FACETS];

  // Tipo de documento facet
  let contentFacet = CONTENT_TYPE_FACETS[input.contentType];
  if (input.contentType === 'jurisprudencia') {
    const tipo = String(input.filters.tipoNorma || '').trim().toLowerCase();
    if (tipo === 'fallo') contentFacet = 'Tipo de Documento/Jurisprudencia/Fallo';
    if (tipo === 'sumario') contentFacet = 'Tipo de Documento/Jurisprudencia/Sumario';
  }
  if (input.contentType === 'legislacion') {
    const subtype = normalizeLegislationSubtype(input.filters.tipoNorma);
    const subtypeConfig = subtype ? LEGISLATION_SUBTYPE_FACETS[subtype] : null;
    if (subtypeConfig?.contentFacet) {
      contentFacet = subtypeConfig.contentFacet;
    }
    if (subtypeConfig?.overrides) {
      for (const [baseFacet, value] of Object.entries(subtypeConfig.overrides) as Array<[BaseFacetName, string]>) {
        if (!value) continue;
        setFacet(facets, baseFacet, value);
      }
    }
  }

  if (contentFacet) {
    setFacet(facets, 'Tipo de Documento', contentFacet);
  }

  // Jurisdicción facet (filtro manual general)
  const jurisdiccion = input.filters.jurisdiccion;
  if (jurisdiccion && jurisdiccion.kind !== "todas" && !isJurisprudenceLikeContentType(input.contentType)) {
    let value = 'Jurisdicción';
    if (jurisdiccion.kind === 'provincial' && jurisdiccion.provincia) {
      value = `Jurisdicción/Local/${jurisdiccion.provincia}`;
    } else if (jurisdiccion.kind === 'nacional') {
      value = 'Jurisdicción/Nacional';
    } else if (jurisdiccion.kind === 'internacional') {
      value = 'Jurisdicción/Internacional';
    }
    setFacet(facets, 'Jurisdicción', value);
  }

  // Facetas secundarias (refinar resultados)
  const fechaFacet = normalizeFacetValue('Fecha', input.filters.facetFecha);
  if (fechaFacet) setFacet(facets, 'Fecha', fechaFacet);

  const jurisdiccionFacet = normalizeFacetValue('Jurisdicción', input.filters.facetJurisdiccion);
  if (jurisdiccionFacet && !isJurisprudenceLikeContentType(input.contentType)) {
    setFacet(facets, 'Jurisdicción', jurisdiccionFacet);
  }

  const estadoFacet = normalizeFacetValue('Estado de Vigencia', input.filters.facetEstadoVigencia);
  if (estadoFacet) setFacet(facets, 'Estado de Vigencia', estadoFacet);

  const temaFacet = normalizeFacetValue('Tema', input.filters.facetTema);
  if (temaFacet) setFacet(facets, 'Tema', temaFacet);

  const organismoFacet = normalizeFacetValue('Organismo', input.filters.facetOrganismo);
  if (organismoFacet) setFacet(facets, 'Organismo', organismoFacet);

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

