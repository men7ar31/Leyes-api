import { logger } from '../../utils/logger';
import { SaijContentType, SaijSearchHit, SaijSearchHitRaw, SaijArticle } from './saij.types';

const normalizeContentType = (value: any, fallback: SaijContentType): SaijContentType => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'jurisprudencia' || normalized === 'sentencia') {
    return 'fallo';
  }
  if (['legislacion', 'fallo', 'sumario', 'dictamen', 'doctrina', 'todo'].includes(normalized)) {
    return normalized as SaijContentType;
  }
  return fallback;
};

const safeParseJson = (payload?: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch (err) {
    logger.warn({ err, preview: payload.slice(0, 200) }, 'No se pudo parsear documentAbstract');
    return null;
  }
};

const prettifyFriendlyDescription = (value?: string | null) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).replace(/-/g, ' ').trim();
  } catch {
    return value.replace(/-/g, ' ').trim();
  }
};

const joinNonEmpty = (parts: Array<string | null | undefined>, sep = ' · ') =>
  parts.filter((p) => p && String(p).trim().length > 0).map((p) => String(p).trim()).join(sep) || null;

const truncate = (text: string | undefined, max = 180) => {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const formatDateShort = (value?: string | null) => {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
};

const formatDateLongEs = (value?: string | null) => {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const monthIndex = Number(m[2]) - 1;
  const month = months[monthIndex] ?? null;
  if (!month) return value;
  return `${Number(m[3])} de ${month} de ${m[1]}`;
};

const buildFalloCaratula = (actor?: string | null, demandado?: string | null, sobre?: string | null) => {
  const actorClean = actor?.trim() || null;
  const demandadoClean = demandado?.trim() || null;
  const sobreClean = sobre?.trim() || null;
  let base = '';
  if (actorClean && demandadoClean) {
    base = `${actorClean} c/ ${demandadoClean}`;
  } else {
    base = actorClean ?? demandadoClean ?? '';
  }
  if (sobreClean) {
    base = base ? `${base} s/ ${sobreClean}` : sobreClean;
  }
  return base.trim() || null;
};

const FALLO_SEARCH_FACET =
  'Total|Tipo de Documento/Jurisprudencia/Fallo|Fecha|Organismo|Tribunal|Tema|Publicación|Estado de Vigencia|Autor|Jurisdicción';

const buildFalloSearchUrl = (title: string) => {
  const normalized = title.trim().replace(/\s+/g, '?');
  const params = new URLSearchParams();
  params.set('r', `titulo:${normalized}`);
  params.set('o', '0');
  params.set('p', '25');
  params.set('f', FALLO_SEARCH_FACET);
  params.set('s', '');
  params.set('v', 'colapsada');
  return `https://www.saij.gob.ar/busqueda?${params.toString()}`;
};

type RelatedContentHint = SaijContentType | 'todo' | 'unknown';
type RelatedContentEntry = {
  title: string;
  subtitle?: string | null;
  contentTypeHint: RelatedContentHint;
  guid?: string | null;
  sourceUrl?: string | null;
};

const buildGenericSearchUrl = (title: string) => {
  const normalized = title.trim().replace(/\s+/g, '?');
  const params = new URLSearchParams();
  params.set('r', `titulo:${normalized}`);
  params.set('o', '0');
  params.set('p', '25');
  params.set('s', '');
  params.set('v', 'colapsada');
  return `https://www.saij.gob.ar/busqueda?${params.toString()}`;
};

const buildSearchUrlByHint = (title: string, hint?: RelatedContentHint) => {
  if (hint === 'fallo') return buildFalloSearchUrl(title);
  return buildGenericSearchUrl(title);
};

const normalizeRelatedHint = (value: any, fallback: RelatedContentHint = 'unknown'): RelatedContentHint => {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return fallback;
  if (raw.includes('jurisprudencia') || raw.includes('sentencia') || raw.includes('fallo')) return 'fallo';
  if (raw.includes('sumario')) return 'sumario';
  if (raw.includes('dictamen')) return 'dictamen';
  if (raw.includes('doctrina')) return 'doctrina';
  if (raw.includes('legisl')) return 'legislacion';
  if (raw.includes('todo')) return 'todo';
  return fallback;
};

const normalizeTagText = (value?: string | null) => {
  if (!value || typeof value !== 'string') return null;
  return value
    .replace(/\[\[\/?p\]\]|\[\/?p\]/gi, '\n')
    .replace(/\[\[\/?r[^\]]*\]\]|\[\/?r[^\]]*\]/gi, ' ')
    .replace(/\[\[\/?[a-z]+[^\]]*\]\]|\[\/?[a-z]+[^\]]*\]/gi, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const normalizeLooseString = (value: any): string | null => {
  if (typeof value === 'string') return normalizeTagText(value);
  if (value && typeof value === 'object') {
    const nested = normalizeSubtitleValue(value);
    if (nested) return normalizeTagText(nested);
  }
  return null;
};

const extractLeadSectionText = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return normalizeTagText(value);

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractLeadSectionText(item))
      .filter((item): item is string => Boolean(item && item.trim().length > 0));
    if (!parts.length) return null;
    return Array.from(new Set(parts)).join('\n\n');
  }

  if (typeof value === 'object') {
    const preferredKeys = ['texto', 'sumario', 'sancion', 'encabezado', 'visto', 'considerando', 'tema', 'indice'];
    const parts: string[] = [];

    preferredKeys.forEach((key) => {
      const picked = normalizeLooseString((value as any)?.[key]);
      if (picked) parts.push(picked);
    });

    if (!parts.length) {
      Object.values(value).forEach((child) => {
        if (typeof child === 'string') {
          const normalized = normalizeTagText(child);
          if (normalized) parts.push(normalized);
        }
      });
    }

    if (!parts.length) return null;
    return Array.from(new Set(parts)).join('\n\n');
  }

  return null;
};

const pickFirstString = (...values: any[]): string | null => {
  for (const value of values) {
    const normalized = normalizeLooseString(value);
    if (normalized && normalized.trim().length > 0) return normalized;
  }
  return null;
};

const extractDoctrinaAuthor = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return normalizeTagText(value);
  if (Array.isArray(value)) {
    const names = value
      .map((item) => extractDoctrinaAuthor(item))
      .filter((item): item is string => Boolean(item && item.trim().length > 0));
    return names.length ? Array.from(new Set(names)).join(', ') : null;
  }
  if (typeof value === 'object') {
    return (
      normalizeLooseString((value as any).autor) ??
      normalizeLooseString((value as any).nombre) ??
      normalizeLooseString((value as any).texto) ??
      null
    );
  }
  return null;
};

const toIsoDateFromSaij = (value: any): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1000 && value <= 3000) {
    return `${Math.trunc(value)}-01-01`;
  }
  return null;
};

const formatDoctrinaDate = (value: any): string | null => {
  const iso = toIsoDateFromSaij(value);
  if (iso) {
    const short = formatDateShort(iso);
    if (short) {
      if (/-01-01$/.test(iso)) return iso.slice(0, 4);
      return short;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const normalizeComparableText = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const PROVINCE_LABELS: Array<{ patterns: string[]; label: string }> = [
  { patterns: ['ciudad autonoma de buenos aires', ' caba '], label: 'Caba' },
  { patterns: ['buenos aires'], label: 'Buenos Aires' },
  { patterns: ['catamarca'], label: 'Catamarca' },
  { patterns: ['chaco'], label: 'Chaco' },
  { patterns: ['chubut'], label: 'Chubut' },
  { patterns: ['cordoba'], label: 'Cordoba' },
  { patterns: ['corrientes'], label: 'Corrientes' },
  { patterns: ['entre rios'], label: 'Entre Rios' },
  { patterns: ['formosa'], label: 'Formosa' },
  { patterns: ['jujuy'], label: 'Jujuy' },
  { patterns: ['la pampa'], label: 'La Pampa' },
  { patterns: ['la rioja'], label: 'La Rioja' },
  { patterns: ['mendoza'], label: 'Mendoza' },
  { patterns: ['misiones'], label: 'Misiones' },
  { patterns: ['neuquen'], label: 'Neuquen' },
  { patterns: ['rio negro'], label: 'Rio Negro' },
  { patterns: ['salta'], label: 'Salta' },
  { patterns: ['san juan'], label: 'San Juan' },
  { patterns: ['san luis'], label: 'San Luis' },
  { patterns: ['santa cruz'], label: 'Santa Cruz' },
  { patterns: ['santa fe'], label: 'Santa Fe' },
  { patterns: ['santiago del estero'], label: 'Santiago del Estero' },
  { patterns: ['tierra del fuego'], label: 'Tierra del Fuego' },
  { patterns: ['tucuman'], label: 'Tucuman' },
];

const inferProvinceLabelFromTexts = (texts: Array<string | null | undefined>): string | null => {
  const haystack = ` ${texts.map((item) => normalizeComparableText(item)).filter(Boolean).join(' ')} `;
  if (!haystack.trim()) return null;
  for (const province of PROVINCE_LABELS) {
    if (province.patterns.some((pattern) => haystack.includes(` ${normalizeComparableText(pattern)} `))) {
      return province.label;
    }
  }
  return null;
};

const normalizeNumberValue = (value: any): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const buildDictamenNumberLabel = (content: Record<string, any>): string | null => {
  const numero =
    normalizeNumberValue(content['numero-dictamen']) ??
    normalizeNumberValue((content as any)?.numero_dictamen) ??
    null;
  const mecanografico = pickFirstString(content['mecanografico'], (content as any)?.mecanografico);
  const fechaIso = toIsoDateFromSaij(content['fecha'] ?? (content as any)?.fecha);
  const year = fechaIso ? fechaIso.slice(0, 4) : null;

  if (numero && year) return `Dictamen Nro. ${numero}/${year}`;
  if (numero) return `Dictamen Nro. ${numero}`;
  if (mecanografico) return `Dictamen ${mecanografico}`;
  return null;
};

const extractDictamenOrganismo = (content: Record<string, any>): string | null =>
  pickFirstString(
    content?.['organismo-emisor']?.organismo,
    content?.organismo_emisor?.organismo,
    content?.['organismo-remitente'],
    content?.organismo_remitente
  );

const buildDictamenDetailText = (content: Record<string, any>): string | null => {
  const numberLabel = buildDictamenNumberLabel(content);
  const fecha = formatDateLongEs(pickFirstString(content['fecha'], (content as any)?.fecha)) ??
    formatDateShort(pickFirstString(content['fecha'], (content as any)?.fecha));
  const organismo = extractDictamenOrganismo(content);
  const procurador = pickFirstString(content['procurador'], (content as any)?.procurador);
  const expediente = pickFirstString(content['nro-expediente'], (content as any)?.nro_expediente);
  const sintesis = normalizeTagText(pickFirstString(content['sintesis'], (content as any)?.sintesis));
  const sumario = normalizeTagText(normalizeSubtitleValue(content['sumario']) ?? pickFirstString(content['sumario']));

  const header = [
    numberLabel,
    fecha,
    organismo,
    procurador ? `Firmante: ${procurador}` : null,
    expediente ? `Expediente: ${expediente}` : null,
  ].filter((line): line is string => Boolean(line && line.trim().length > 0));

  const sections: string[] = [];
  if (header.length) sections.push(header.join('\n'));
  if (sintesis) sections.push(`SINTESIS\n${sintesis}`);
  if (sumario && (!sintesis || sumario !== sintesis)) sections.push(`SUMARIO\n${sumario}`);

  return sections.length ? sections.join('\n\n') : null;
};

const buildFalloDetailText = (content: Record<string, any>, metadata: Record<string, any>): string | null => {
  const tipoFallo =
    pickFirstString(
      content?.['tipo-fallo'],
      content?.tipo_fallo,
      metadata?.['tipo-fallo'],
      metadata?.tipo_fallo
    ) ?? 'SENTENCIA';

  const fechaRaw = pickFirstString(
    content?.fecha,
    content?.['fecha-fallo'],
    content?.fecha_fallo,
    metadata?.fecha,
    metadata?.['fecha-fallo'],
    metadata?.fecha_fallo
  );
  const fecha = formatDateLongEs(fechaRaw) ?? formatDateShort(fechaRaw);

  const nroInterno = pickFirstString(
    content?.['numero-interno'],
    content?.numero_interno,
    content?.['nro-interno'],
    content?.nro_interno,
    metadata?.['numero-interno'],
    metadata?.numero_interno
  );

  const tribunal = pickFirstString(
    content?.tribunal,
    content?.organismo,
    content?.['organo-judicial'],
    content?.organo_judicial,
    metadata?.tribunal,
    metadata?.organismo
  );

  const magistrados = pickFirstString(
    content?.magistrados,
    content?.jueces,
    content?.integracion,
    metadata?.magistrados
  );

  const idSaij = pickFirstString(
    content?.['id-infojus'],
    content?.id_infojus,
    content?.['numero-sumario'],
    content?.numero_sumario,
    metadata?.['id-infojus'],
    metadata?.id_infojus
  );

  const summaryRaw = pickFirstString(
    content?.texto,
    content?.['texto-fallo'],
    content?.texto_fallo,
    normalizeSubtitleValue(content?.sumario),
    content?.sumario
  );
  const summary = summaryRaw ? summaryRaw.replace(/^sumario\s*:?\s*/i, '').trim() : null;

  const headerLines = [
    tipoFallo ? tipoFallo.toUpperCase() : null,
    fecha,
    nroInterno ? `Nro. Interno: ${nroInterno}` : null,
    tribunal ? tribunal.toUpperCase() : null,
    magistrados ? `Magistrados: ${magistrados}` : null,
    idSaij ? `Id SAIJ: ${idSaij}` : null,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  const sections: string[] = [];
  if (headerLines.length) sections.push(headerLines.join('\n'));
  if (summary) sections.push(`SUMARIO\n${summary}`);

  return sections.length > 0 ? sections.join('\n\n') : null;
};

const extractInlineReferenceLabels = (texto?: string | null): string[] => {
  if (!texto || typeof texto !== 'string') return [];
  const labels: string[] = [];
  const regex = /\[\[r[^\]]*\]\]([\s\S]*?)\[\[\/r[^\]]*\]\]/gi;
  let match: RegExpExecArray | null = regex.exec(texto);
  while (match) {
    const label = normalizeTagText(match[1]);
    if (label) labels.push(label);
    match = regex.exec(texto);
  }
  return Array.from(new Set(labels));
};

const parseNormativeRefCode = (raw?: string | null): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value) return null;

  const leyMatch = value.match(/^LEY\s+C?\s+0*(\d{1,7})\b/i);
  if (leyMatch) return `Ley ${Number(leyMatch[1])}`;

  const cccnMatch = value.match(/^CCN\s+C\s+0*(\d{1,7})\s+\d{4}\s+\d{2}\s+\d{2}\s+0*(\d{1,5})\b/i);
  if (cccnMatch) {
    return `Codigo Civil y Comercial de la Nacion (Ley ${Number(cccnMatch[1])}) Art. ${Number(cccnMatch[2])}`;
  }

  const decretoMatch = value.match(/^DEC(?:RETO)?\s+C?\s+0*(\d{1,7})\s+(\d{4})\b/i);
  if (decretoMatch) {
    return `Decreto ${Number(decretoMatch[1])}/${decretoMatch[2]}`;
  }

  const dnuMatch = value.match(/^DNU\s+C?\s+0*(\d{1,7})\s+(\d{4})\b/i);
  if (dnuMatch) {
    return `DNU ${Number(dnuMatch[1])}/${dnuMatch[2]}`;
  }

  const resolucionMatch = value.match(/^RES(?:OLUCION)?\s+C?\s+0*(\d{1,7})\s+(\d{4})\b/i);
  if (resolucionMatch) {
    return `Resolucion ${Number(resolucionMatch[1])}/${resolucionMatch[2]}`;
  }

  return null;
};

const isShorthandNormReference = (value?: string | null): boolean => {
  if (!value || typeof value !== 'string') return false;
  const line = value.trim().toUpperCase();
  return /^(CCCN|CCN|CPCCN|CPN|CN|CC)\s*\.?\s*\d{1,5}[A-Z]?\b/.test(line);
};

const isHumanReadableRelatedLine = (value: string): boolean => {
  const line = value.trim();
  if (!line) return false;
  if (isShorthandNormReference(line)) return false;
  if (/^REFERENCIAS?_NORMATIVAS?/i.test(line)) return false;
  if (/^[A-Z0-9_]{8,}$/.test(line)) return false;
  if (line.length > 220) return false;
  if (/^[A-Z0-9 .\-\/]+$/.test(line) && /\d{6,}/.test(line) && !/[.,]/.test(line) && !/[a-záéíóúñ]/i.test(line)) {
    return false;
  }
  return true;
};

const isNormativeReferenceNote = (value?: string | null): boolean => {
  if (!value || typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean) return false;
  if (/^\((?:B\.?\s*O\.?|SUP\.?\s*B\.?\s*O\.?)\b/i.test(clean)) return true;
  if (/\b(observa|observado|vigencia|prorroga|prorrog[aá]|modifica|modificado)\b/i.test(clean)) return true;
  return false;
};

const normalizeRelatedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, ' ').trim();

const dedupeRelatedItems = <T extends { title: string; contentTypeHint?: RelatedContentHint }>(items: T[]) => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${normalizeRelatedKey(item.title)}::${item.contentTypeHint ?? 'unknown'}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const toResolvedLinkedRef = (item: RelatedContentEntry) => ({
  title: item.title,
  subtitle: item.subtitle ?? null,
  contentTypeHint: item.contentTypeHint,
  guid: item.guid ?? null,
  sourceUrl: item.sourceUrl ?? null,
  url: item.sourceUrl ?? buildSearchUrlByHint(item.title, item.contentTypeHint),
});

const dedupeLinkedRefs = <T extends { title: string; contentTypeHint?: RelatedContentHint }>(items: T[]) =>
  dedupeRelatedItems(items);

const extractContentEntriesFromNode = (node: any, defaultHint: RelatedContentHint = 'legislacion') => {
  const results: RelatedContentEntry[] = [];

  const pushEntry = (entry: {
    title?: string | null;
    subtitle?: string | null;
    contentTypeHint?: RelatedContentHint;
    guid?: string | null;
    sourceUrl?: string | null;
  }) => {
    const title = normalizeTagText(entry.title ?? null);
    if (!title) return;
    if (!isHumanReadableRelatedLine(title)) return;
    const compact = title.replace(/\s+/g, ' ').trim();
    const looksLikeMachineToken =
      /^[A-Z0-9_]+$/i.test(compact) &&
      !/[a-záéíóúñ]/i.test(compact) &&
      compact.length > 10;
    if (looksLikeMachineToken) return;
    results.push({
      title,
      subtitle: entry.subtitle ?? null,
      contentTypeHint: entry.contentTypeHint ?? defaultHint,
      guid: entry.guid ?? null,
      sourceUrl: entry.sourceUrl ?? null,
    });
  };

  const walk = (current: any, inheritedHint: RelatedContentHint) => {
    if (!current) return;
    if (typeof current === 'string') {
      const normalized = normalizeTagText(current);
      if (!normalized) return;
      const lines = normalized
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (!lines.length) {
        pushEntry({ title: normalized, contentTypeHint: inheritedHint });
        return;
      }
      lines.forEach((line) => pushEntry({ title: line, contentTypeHint: inheritedHint }));
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, inheritedHint));
      return;
    }
    if (typeof current !== 'object') return;

    const hintedType = normalizeRelatedHint(
      current['document-content-type'] ??
      current.document_content_type ??
      current['tipo-documento'] ??
      current.tipo_documento ??
      current.tipo ??
      (current['tipo-fallo'] || current.tipo_fallo ? 'fallo' : null),
      inheritedHint
    );

    const parsedRef = typeof current.ref === 'string' ? parseNormativeRefCode(current.ref) : null;
    const crText = normalizeLooseString(current.cr);
    const useParsedRefAsTitle = Boolean(parsedRef && crText && isNormativeReferenceNote(crText));
    const title =
      (useParsedRefAsTitle ? parsedRef : crText) ??
      (!useParsedRefAsTitle ? parsedRef : null) ??
      normalizeLooseString(current.titulo) ??
      normalizeLooseString(current.caratula) ??
      normalizeLooseString(current.nombre) ??
      normalizeLooseString(current.descripcion) ??
      normalizeLooseString(current.texto) ??
      normalizeLooseString(current.sumario);
    const subtitle = joinNonEmpty(
      [
        useParsedRefAsTitle ? crText : null,
        normalizeLooseString(current['tipo-fallo'] ?? current.tipo_fallo),
        normalizeLooseString(current.tribunal),
        formatDateShort(normalizeLooseString(current.fecha)),
      ],
      '. '
    );
    const guid =
      normalizeLooseString(current.guid) ??
      normalizeLooseString(current.uuid) ??
      normalizeLooseString(current.id) ??
      null;
    const sourceUrl = normalizeLooseString(current.url) ?? normalizeLooseString(current.sourceUrl) ?? null;

    if (title) {
      pushEntry({
        title,
        subtitle,
        contentTypeHint: hintedType,
        guid,
        sourceUrl,
      });
    }

    Object.values(current).forEach((child) => walk(child, hintedType));
  };

  walk(node, defaultHint);
  return dedupeRelatedItems(results);
};

const normalizeKeyForSection = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const matchesAny = (value: string, patterns: ReadonlyArray<RegExp>) => patterns.some((pattern) => pattern.test(value));

const SECTION_PATTERNS = {
  normasQueModifica: [
    /\bnormas?\s+que\s+modifica\b/i,
    /\bnorma\s+que\s+modifica\b/i,
    /\bmodifica\s+a\b/i,
    /\bderoga\s+a\b/i,
    /\bsustituye\s+a\b/i,
    /\bincorpora\s+a\b/i,
    /\breemplaza\s+a\b/i,
  ],
  normasComplementarias: [
    /\bnormas?\s+compl/i,
    /\bnormas?\s+complement/i,
    /\bcomplementari[ao]s?\b/i,
    /\bconcordancias?\b/i,
    /\bobservad[oa]\s+por\b/i,
    /\bmodificad[oa]\s+por\b/i,
    /\bprorrogad[oa]\s+por\b/i,
    /\breglamentad[oa]\s+por\b/i,
  ],
  observaciones: [
    /\bobservaciones?\b/i,
    /\bobs\b/i,
  ],
} as const;

const SECTION_EXACT_KEYS = {
  normasQueModifica: new Set([
    'normas que modifica',
    'norma que modifica',
    'modifica a',
    'deroga a',
    'sustituye a',
    'incorpora a',
    'reemplaza a',
  ]),
  normasComplementarias: new Set([
    'normas complementarias',
    'normas compl',
    'observado por',
    'modificado por',
    'prorrogado por',
    'reglamentado por',
    'concordancias',
  ]),
  observaciones: new Set([
    'observaciones',
    'observaciones generales',
    'obs',
  ]),
} as const;

const extractNormativeSectionEntries = (content: any) => {
  const buckets: {
    normasQueModifica: RelatedContentEntry[];
    normasComplementarias: RelatedContentEntry[];
    observaciones: RelatedContentEntry[];
  } = {
    normasQueModifica: [],
    normasComplementarias: [],
    observaciones: [],
  };

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    Object.entries(node).forEach(([rawKey, value]) => {
      const key = normalizeKeyForSection(rawKey);
      if (
        SECTION_EXACT_KEYS.normasQueModifica.has(key) ||
        matchesAny(key, SECTION_PATTERNS.normasQueModifica)
      ) {
        buckets.normasQueModifica.push(...extractContentEntriesFromNode(value, 'legislacion'));
      }
      if (
        SECTION_EXACT_KEYS.normasComplementarias.has(key) ||
        matchesAny(key, SECTION_PATTERNS.normasComplementarias)
      ) {
        buckets.normasComplementarias.push(...extractContentEntriesFromNode(value, 'legislacion'));
      }
      if (
        SECTION_EXACT_KEYS.observaciones.has(key) ||
        matchesAny(key, SECTION_PATTERNS.observaciones)
      ) {
        buckets.observaciones.push(...extractContentEntriesFromNode(value, 'legislacion'));
      }
      walk(value);
    });
  };

  walk(content);

  return {
    normasQueModifica: dedupeRelatedItems(buckets.normasQueModifica),
    normasComplementarias: dedupeRelatedItems(buckets.normasComplementarias),
    observaciones: dedupeRelatedItems(buckets.observaciones),
  };
};

const extractRelatedFalloEntries = (content: any) => {
  const results: Array<{
    title: string;
    subtitle?: string | null;
    contentTypeHint: 'fallo';
    guid?: string | null;
    sourceUrl?: string | null;
  }> = [];

  const pushEntry = (entry: {
    title?: string | null;
    subtitle?: string | null;
    guid?: string | null;
    sourceUrl?: string | null;
  }) => {
    const title = normalizeTagText(entry.title ?? null);
    if (!title || !isHumanReadableRelatedLine(title)) return;
    results.push({
      title,
      subtitle: entry.subtitle ?? null,
      contentTypeHint: 'fallo',
      guid: entry.guid ?? null,
      sourceUrl: entry.sourceUrl ?? null,
    });
  };

  const walk = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      pushEntry({ title: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    const title =
      normalizeLooseString(node.caratula) ??
      normalizeLooseString(node.titulo) ??
      normalizeLooseString(node.nombre) ??
      normalizeLooseString(node.descripcion);

    const subtitle = joinNonEmpty(
      [
        normalizeLooseString(node['tipo-fallo'] ?? node.tipo_fallo),
        normalizeLooseString(node.tribunal),
        formatDateShort(normalizeLooseString(node.fecha)),
      ],
      '. '
    );

    const guid =
      normalizeLooseString(node.guid) ??
      normalizeLooseString(node.uuid) ??
      normalizeLooseString(node.id) ??
      null;

    const sourceUrl = normalizeLooseString(node.url) ?? normalizeLooseString(node.sourceUrl) ?? null;
    if (title) pushEntry({ title, subtitle, guid, sourceUrl });

    Object.values(node).forEach(walk);
  };

  walk(content?.['fallos-a-los-que-aplica'] ?? content?.fallos_a_los_que_aplica ?? null);
  walk(content?.['fallos-relacionados'] ?? content?.fallos_relacionados ?? null);

  return dedupeRelatedItems(results);
};

const extractRelatedContentEntries = (content: any) => {
  const results: RelatedContentEntry[] = [];

  const pushEntry = (entry: RelatedContentEntry) => {
    const title = normalizeTagText(entry.title ?? null);
    if (!title || !isHumanReadableRelatedLine(title)) return;
    results.push({
      title,
      subtitle: entry.subtitle ?? null,
      contentTypeHint: entry.contentTypeHint ?? 'unknown',
      guid: entry.guid ?? null,
      sourceUrl: entry.sourceUrl ?? null,
    });
  };

  const walkReferences = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walkReferences);
      return;
    }
    if (typeof node !== 'object') return;

    const parsedRef = typeof node.ref === 'string' ? parseNormativeRefCode(node.ref) : null;

    if (typeof node.cr === 'string' && !(parsedRef && isShorthandNormReference(node.cr))) {
      pushEntry({ title: node.cr, contentTypeHint: 'legislacion' });
    }
    if (parsedRef) {
      pushEntry({ title: parsedRef, contentTypeHint: 'legislacion' });
    }

    Object.values(node).forEach(walkReferences);
  };

  const walkLabeled = (node: any, defaultHint: RelatedContentHint = 'unknown') => {
    if (!node) return;
    if (typeof node === 'string') {
      pushEntry({ title: node, contentTypeHint: defaultHint });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walkLabeled(child, defaultHint));
      return;
    }
    if (typeof node !== 'object') return;

    const hintedType = normalizeRelatedHint(
      node['document-content-type'] ??
      node.document_content_type ??
      node['tipo-documento'] ??
      node.tipo_documento ??
      node.tipo ??
      (node['tipo-fallo'] || node.tipo_fallo ? 'fallo' : null),
      defaultHint
    );

    const title =
      normalizeLooseString(node.titulo) ??
      normalizeLooseString(node.caratula) ??
      normalizeLooseString(node.nombre) ??
      normalizeLooseString(node.descripcion) ??
      normalizeLooseString(node.texto) ??
      normalizeLooseString(node.sumario);
    const subtitle = joinNonEmpty(
      [
        normalizeLooseString(node['tipo-fallo'] ?? node.tipo_fallo),
        normalizeLooseString(node.tribunal),
        formatDateShort(normalizeLooseString(node.fecha)),
      ],
      '. '
    );
    const guid =
      normalizeLooseString(node.guid) ??
      normalizeLooseString(node.uuid) ??
      normalizeLooseString(node.id) ??
      null;
    const sourceUrl = normalizeLooseString(node.url) ?? normalizeLooseString(node.sourceUrl) ?? null;

    if (title) {
      pushEntry({
        title,
        subtitle,
        contentTypeHint: hintedType,
        guid,
        sourceUrl,
      });
    }

    Object.values(node).forEach((child) => walkLabeled(child, defaultHint));
  };

  walkReferences(content?.['referencias-normativas'] ?? content?.referencias_normativas ?? null);
  walkLabeled(content?.['contenido-relacionado'] ?? content?.contenido_relacionado ?? content?.contenidoRelacionados ?? null);
  extractInlineReferenceLabels(content?.texto).forEach((label) =>
    pushEntry({ title: label, contentTypeHint: 'legislacion' })
  );

  return dedupeRelatedItems(results);
};

const normalizeSubtitleValue = (value: any): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const sumario = (value as any).sumario;
    if (typeof sumario === 'string') return sumario;
    const texto = (value as any).texto;
    if (typeof texto === 'string') return texto;
  }
  return null;
};

const METADATA_KEYS = [
  'sumario',
  'resumen',
  'abstract',
  'descriptor',
  'descriptores',
  'generalidades',
  'observaciones',
  'observaciones-generales',
  'observaciones_generales',
  'tema',
  'temas',
  'materia',
  'keywords',
  'palabras-clave',
  'palabras_clave',
  'tags',
];

const shouldSkipKey = (key: string) => {
  const normalized = key.toLowerCase();
  return METADATA_KEYS.some((token) => normalized === token || normalized.includes(token));
};

type LegalBodyAnalysis = { ok: boolean; reason: string | null };

const normalizeHeuristicText = (text: string) =>
  text
    .replace(/\[\[\/?[a-z]+\]\]/gi, ' ')
    .replace(/\[\/?[a-z]+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasArticlePattern = (text: string) => /(art[íi]culo|art\.?)\s*\d+/i.test(text);

const hasLegalStructurePattern = (text: string) =>
  /\b(cap[ií]tulo|t[íi]tulo|secci[oó]n|considerando|visto|resuelve|decreta|disp[oó]nese|sanc[ií]onase|por ello|en uso de|el senado|la c[áa]mara|el congreso|el poder ejecutivo)\b/i.test(
    text
  );

const looksLikeDescriptorList = (text: string) => {
  const letters = text.match(/[A-ZÁÉÍÓÚÑ]/gi) ?? [];
  const upper = text.match(/[A-ZÁÉÍÓÚÑ]/g) ?? [];
  const upperRatio = letters.length ? upper.length / letters.length : 0;
  const hyphenRuns = text.match(/[A-ZÁÉÍÓÚÑ]{3,}(?:\s*-\s*[A-ZÁÉÍÓÚÑ]{3,}){3,}/g) ?? [];
  const hyphenCount = (text.match(/-/g) ?? []).length;
  return (upperRatio > 0.65 && hyphenCount >= 5) || hyphenRuns.length > 0;
};

const analyzeLegalBodyText = (text: string, sourcePath?: string): LegalBodyAnalysis => {
  const cleaned = normalizeHeuristicText(text);
  if (!cleaned) return { ok: false, reason: 'no_article_structure' };

  const lower = cleaned.toLowerCase();
  if (sourcePath && METADATA_KEYS.some((key) => sourcePath.toLowerCase().includes(key))) {
    return { ok: false, reason: 'sumario_detected' };
  }
  if (lower.startsWith('sumario') || lower.startsWith('resumen') || lower.startsWith('abstract')) {
    return { ok: false, reason: 'sumario_detected' };
  }
  if (looksLikeDescriptorList(cleaned)) {
    return { ok: false, reason: 'descriptor_like_text' };
  }

  if (hasArticlePattern(cleaned)) return { ok: true, reason: null };
  if (hasLegalStructurePattern(cleaned)) return { ok: true, reason: null };

  return { ok: false, reason: 'no_article_structure' };
};

export const isLikelyLegalBodyText = (text: string): boolean => analyzeLegalBodyText(text).ok;

export const mapSaijSearchHit = (
  raw: SaijSearchHitRaw,
  fallbackContentType: SaijContentType
): SaijSearchHit => {
  const abstractObj = safeParseJson(typeof raw.documentAbstract === 'string' ? raw.documentAbstract : undefined);
  const metadata = (abstractObj as any)?.document?.metadata ?? {};
  const content = (abstractObj as any)?.document?.content ?? {};

  const friendlyMeta = metadata['friendly-url'] ?? metadata['friendly_url'];
  const subdomain = friendlyMeta?.subdomain as string | undefined;
  const description = friendlyMeta?.description as string | undefined;
  const friendlyUrl = subdomain && description ? `https://www.saij.gob.ar/${subdomain}-${description}` : null;

  const inferredContentType =
    metadata['document-content-type'] ??
    (abstractObj as any)?.['document-content-type'] ??
    raw.documentContentType;

  const contentType = normalizeContentType(inferredContentType, fallbackContentType);

  const actor = typeof content['actor'] === 'string' ? content['actor'] : null;
  const demandado = typeof content['demandado'] === 'string' ? content['demandado'] : null;
  const sobre = typeof content['sobre'] === 'string' ? content['sobre'] : null;
  const tituloSumario = normalizeTagText(typeof content['titulo'] === 'string' ? content['titulo'] : null);
  const tituloDoctrina = pickFirstString(content['titulo-doctrina'], (content as any)?.titulo_doctrina);
  const autorDoctrina = extractDoctrinaAuthor(content['autor-doctrina'] ?? (content as any)?.autor_doctrina);
  const publicacionDoctrina = pickFirstString(content['publicacion'], (content as any)?.publicacion);
  const fechaPublicacionRaw = content['fecha-publicacion'] ?? (content as any)?.fecha_publicacion ?? null;
  const fechaDoctrinaIso = toIsoDateFromSaij(fechaPublicacionRaw);
  const fechaDoctrinaLabel = formatDoctrinaDate(fechaPublicacionRaw);
  const partesDictamen = pickFirstString(content['partes'], (content as any)?.partes);
  const dictamenNumberLabel = buildDictamenNumberLabel(content as Record<string, any>);
  const dictamenOrganismo = extractDictamenOrganismo(content as Record<string, any>);
  const dictamenSintesis = normalizeTagText(pickFirstString(content['sintesis'], (content as any)?.sintesis));
  const fechaDictamenIso = toIsoDateFromSaij(content['fecha'] ?? (content as any)?.fecha);
  const caratula =
    normalizeSubtitleValue(content['caratula']) ??
    (typeof content['caratula'] === 'string' ? content['caratula'] : null) ??
    (contentType === 'fallo' ? buildFalloCaratula(actor, demandado, sobre) : null);

  const title = (
    (contentType === 'sumario'
      ? tituloSumario ?? caratula
      : contentType === 'dictamen'
        ? partesDictamen ?? caratula
      : contentType === 'doctrina'
        ? tituloDoctrina ?? caratula
        : caratula) ??
    content['titulo-norma'] ??
    content['nombre-coloquial'] ??
    prettifyFriendlyDescription(description) ??
    (raw as any).uuid ??
    ''
  );

  const sumario = normalizeTagText(normalizeSubtitleValue(content['sumario']));

  const rawSummaryText = normalizeTagText(typeof content['texto'] === 'string' ? content['texto'] : null);

  const falloSubtitle = joinNonEmpty([
    typeof content['tipo-fallo'] === 'string' ? content['tipo-fallo'] : null,
    typeof content['tribunal'] === 'string' ? content['tribunal'] : null,
    formatDateShort(typeof content['fecha'] === 'string' ? content['fecha'] : null),
  ], '. ');

  const sumarioSubtitle = joinNonEmpty([
    'Sumario de Fallo',
    formatDateShort(typeof content['fecha'] === 'string' ? content['fecha'] : null),
  ], '. ');

  const legislationMetaSubtitle = joinNonEmpty(
    [
      joinNonEmpty(
        [
          normalizeLooseString(content['tipo-norma']?.texto ?? content['tipo-norma'] ?? (content as any)?.tipo_norma?.texto),
          normalizeLooseString(content['numero-sumario'] ?? content['numero-norma'] ?? (content as any)?.numero_norma),
          formatDateShort(normalizeLooseString(content['fecha'])),
        ],
        '. '
      ),
      normalizeLooseString(content['estado']?.texto ?? content['estado']),
      normalizeLooseString(content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion),
    ],
    '. '
  );

  const subtitle =
    (contentType === 'fallo'
      ? falloSubtitle
      : contentType === 'sumario'
        ? sumarioSubtitle
      : contentType === 'dictamen'
        ? joinNonEmpty([dictamenNumberLabel, dictamenOrganismo], '. ')
      : contentType === 'doctrina'
        ? joinNonEmpty([
            'Doctrina',
            autorDoctrina,
            publicacionDoctrina,
            fechaDoctrinaLabel,
          ], '. ')
      : legislationMetaSubtitle ??
        truncate(sumario ?? undefined, 180) ??
        joinNonEmpty([
          content['tipo-norma']?.texto,
          content['numero-sumario'],
          content['fecha'],
          content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
        ])) ?? null;

  const summary =
    contentType === 'sumario'
      ? rawSummaryText ?? sumario
      : contentType === 'dictamen'
        ? dictamenSintesis ?? sumario ?? rawSummaryText
      : contentType === 'doctrina'
        ? sumario ?? truncate(rawSummaryText ?? undefined, 400)
      : sumario ?? rawSummaryText;

  const rawJurisdiccionProvincia = normalizeLooseString(content['jurisdiccion']?.provincia ?? null);
  const rawJurisdiccionDescripcion = normalizeLooseString(content['jurisdiccion']?.descripcion ?? null);
  const rawJurisdiccion = rawJurisdiccionProvincia ?? rawJurisdiccionDescripcion ?? null;
  const normalizedRawJurisdiccion = normalizeComparableText(rawJurisdiccion);
  const inferredProvince = inferProvinceLabelFromTexts([
    title,
    subtitle,
    summary,
    rawSummaryText,
    sumario,
    rawJurisdiccionProvincia,
    normalizeLooseString(content['organismo'] as any),
    normalizeLooseString(content['publicacion'] as any),
  ]);
  const jurisdiccion =
    normalizedRawJurisdiccion.includes('nacional') ||
    normalizedRawJurisdiccion.includes('federal') ||
    normalizedRawJurisdiccion.includes('internacional')
      ? rawJurisdiccion
      : inferredProvince ??
        (normalizedRawJurisdiccion.includes('local') || normalizedRawJurisdiccion.includes('provincial')
          ? 'Provincial'
          : rawJurisdiccion);

  return {
    guid: (raw as any).uuid ?? raw.guid ?? raw.id ?? '',
    title,
    subtitle,
    summary,
    contentType,
    fecha:
      contentType === 'doctrina'
        ? (fechaDoctrinaIso ?? null)
        : contentType === 'dictamen'
          ? (fechaDictamenIso ?? null)
          : content['fecha'] ?? null,
    estado: content['estado'] ?? null,
    jurisdiccion,
    fuente: 'SAIJ',
    friendlyUrl,
    friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
    sourceUrl: friendlyUrl,
    raw,
  };
};

// Helpers for document detail
const htmlToText = (html?: string | null) => {
  if (!html) return null;
  try {
    const { load } = require('cheerio');
    const $ = load(html);
    $('script, style, noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
};

const extractMainHtml = (html?: string | null) => {
  if (!html) return null;
  try {
    const { load } = require('cheerio');
    const $ = load(html);
    $('script, style, nav, header, footer, aside, form, noscript').remove();
    $('.breadcrumb, .breadcrumbs, .share, .social, .banner, .ads, .cookie, .consent, .navbar, .menu').remove();
    const mainCandidates = [
      'main',
      'article',
      '.contenido',
      '.content',
      '.documento',
      '.cuerpo',
      '.detalle',
      '.norma',
      '.texto',
      '#content',
      '#main',
      '.doc-body',
    ];
    for (const sel of mainCandidates) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) return el.html();
    }
    const bodyHtml = $('body').html();
    if (bodyHtml && bodyHtml.trim().length > 200) return bodyHtml;
    return null;
  } catch {
    return html;
  }
};

const parseArticlesFromText = (text?: string | null) => {
  if (!text) return [];
  const pattern = /(art[íi]culo|art\.?)\s+(\d+)[\.:]?\s*/gi;
  const matches: { start: number; end: number; number: string }[] = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index;
    if (matches.length) {
      matches[matches.length - 1].end = start;
    }
    matches.push({ start, end: text.length, number: m[2] });
  }
  if (matches.length === 0) return [];
  return matches.map((seg) => {
    const segmentText = text.slice(seg.start, seg.end).replace(/\s+/g, ' ').trim();
    return { number: seg.number, title: null, text: segmentText };
  });
};

const extractLeadTextBeforeFirstArticle = (text?: string | null): string | null => {
  if (!text || typeof text !== 'string') return null;
  const normalized = cleanStructuredText(text);
  if (!normalized) return null;
  const match = normalized.match(/(?:^|\n)\s*(?:ART[ÍI]CULO|ART\.?)\s*\d+/i);
  if (!match || typeof match.index !== 'number') return null;
  const before = normalized.slice(0, match.index).trim();
  return before.length > 0 ? before : null;
};

const pickBestHeaderText = (...candidates: Array<string | null | undefined>): string | null => {
  const unique = Array.from(
    new Set(
      candidates
        .map((value) => (typeof value === 'string' ? cleanStructuredText(value) : ''))
        .filter((value) => value.length > 0)
    )
  );
  if (!unique.length) return null;

  const score = (value: string) => {
    let points = 0;
    if (/\b(visto|considerando|tema|indice|encabezado)\b/i.test(value)) points += 20;
    if (/\b(por ello|decreta|resuelve)\b/i.test(value)) points += 35;
    points += Math.min(40, Math.floor(value.length / 120));
    return points;
  };

  return unique
    .sort((a, b) => {
      const byScore = score(b) - score(a);
      if (byScore !== 0) return byScore;
      return b.length - a.length;
    })[0] ?? null;
};

type MapDocOptions = { guid: string; fallbackHtml?: string; friendlyUrl?: string };

export type ExtractedRenderable = {
  contentHtml?: string | null;
  contentText?: string | null;
  leadText?: string | null;
  articles?: SaijArticle[];
  toc?: { label: string; anchor?: string }[];
  sourcePath?: string;
  fromArticulo?: boolean;
  structuredArticlePath?: string | null;
  structuredArticleCount?: number;
};

const cleanStructuredText = (text: string) => {
  let value = text.replace(/\r\n/g, '\n');
  value = value.replace(/\[\[\/?p\]\]|\[\/?p\]/gi, '\n');
  value = value.replace(/\[\[\/?r[^\]]*\]\]/gi, '\n');
  value = value.replace(/\[\[\/?[a-z]+\]\]|\[\/?[a-z]+\]/gi, '\n');
  value = value.replace(/[ \t]+\n/g, '\n');
  value = value.replace(/\n{3,}/g, '\n\n');
  value = value.replace(/[ \t]{2,}/g, ' ');
  return value.trim();
};

const getStructuredArticleSources = (raw: any) => {
  const doc = raw?.document ?? raw?.data?.document ?? null;
  const content = doc?.content ?? raw?.content ?? raw?.data?.content ?? null;
  const segmento = content?.segmento ?? content?.segmentos ?? null;
  const directArticulo = content?.articulo ?? content?.articulos ?? null;
  const anexo = content?.anexo ?? content?.anexos ?? null;
  return { segmento, directArticulo, anexo };
};

const normalizeArticleNumberToken = (value: string): string => {
  const normalized = String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[º°]/g, '')
    .replace(/[.:;,\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.replace(/^(?:art[íi]culo|art\.?)\s*/i, '').trim();
};

const detectArticleNumber = (text: string, item?: any, index?: number): string => {
  const fromItem =
    item?.['numero-articulo'] ??
    item?.numero ??
    item?.nro ??
    item?.num ??
    item?.orden ??
    item?.articulo ??
    item?.numeroArticulo ??
    item?.numero_articulo ??
    item?.id;
  if (typeof fromItem === 'number' || typeof fromItem === 'string') {
    const normalized = normalizeArticleNumberToken(String(fromItem));
    if (normalized.length > 0) return normalized;
  }
  const match = text.match(/^\s*(?:art[íi]culo|art\.?)\s*(\d+[a-zA-Z]?(?:\s*bis)?)\b/i);
  if (match && match[1]) return normalizeArticleNumberToken(match[1]);
  return typeof index === 'number' ? String(index + 1) : '';
};

const normalizeHeadingText = (value: any): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = cleanStructuredText(value).replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned : null;
};

const isParagraphHeadingLine = (value?: string | null) => /^par(a|á)grafo\b/i.test(normalizeComparableText(value));

const appendUniqueHeading = (headings: string[], value: string | null) => {
  if (!value) return headings;
  if (isParagraphHeadingLine(value)) return headings;
  if (headings.some((item) => item.toLowerCase() === value.toLowerCase())) return headings;
  return [...headings, value];
};

const buildArticleHeaderLine = (articleNumber?: string | null) => {
  const normalizedNumber = normalizeArticleNumberToken(String(articleNumber || ''));
  if (!normalizedNumber) return 'ARTICULO.';
  return `ARTICULO ${normalizedNumber}.`;
};

const stripArticleLeadFromText = (value?: string | null) => {
  const cleaned = cleanStructuredText(String(value || ''));
  if (!cleaned) return '';
  return cleaned
    .replace(
      /^\s*(?:art[íi]culo|art\.?)\s*(?:[a-z]\s*)?\d+[a-z]?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*(?:º|°)?\s*[\.\-:;]*\s*/i,
      ''
    )
    .trimStart();
};

const isCivilCommercialCodeTitle = (title?: string | null) =>
  normalizeComparableText(title).includes('codigo civil y comercial');

const isAnnexHeading = (value?: string | null) => /^anexo\b/i.test(normalizeComparableText(value));

const isLikelyArticleNode = (item: any, cleanedText: string, path: string) => {
  const hasNumberField =
    item?.['numero-articulo'] !== undefined ||
    item?.numeroArticulo !== undefined ||
    item?.numero_articulo !== undefined ||
    item?.numero !== undefined ||
    item?.nro !== undefined ||
    item?.num !== undefined;
  const pathSuggestsArticle = /(?:^|\.)(articulo|articulos)(?:\[|$)/i.test(path);
  const textStartsWithArticle = /^\s*(?:art[íi]culo|art\.?)\s*[\da-z]/i.test(cleanedText);
  return Boolean(hasNumberField || pathSuggestsArticle || textStartsWithArticle);
};

const isLikelyNormasQueModificaArticle = (text: string) =>
  /\b(der[óo]gase|sustit[uú]yese|modif[ií]case|incorp[oó]rase|reempl[aá]zase|supr[ií]mase|d[eé]jase\s+sin\s+efecto)\b/i.test(
    text
  );

const buildStructuredArticleTitle = (item: any, headings: string[]) => {
  const ownTitle =
    normalizeHeadingText(item?.['titulo-articulo']) ??
    normalizeHeadingText(item?.tituloArticulo) ??
    normalizeHeadingText(item?.titulo);
  let parts = headings;
  if (ownTitle) parts = appendUniqueHeading(parts, ownTitle);
  return parts.length ? parts.join(' · ') : null;
};

const deepFindRenderable = (obj: any, path = '', found: ExtractedRenderable = {}): ExtractedRenderable => {
  if (!obj) return found;
  if (typeof obj === 'string') {
    const value = obj;
    const isHtml = /<\s*(p|div|html|body|span|br|section|article)/i.test(value) && value.length > 200;
    const isLongText = value.length > 400;
    if (isHtml && !found.contentHtml) {
      found.contentHtml = value;
      found.sourcePath = path;
    } else if (isLongText && !found.contentText) {
      found.contentText = value;
      found.sourcePath = found.sourcePath ?? path;
    }
    return found;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => deepFindRenderable(item, `${path}[${idx}]`, found));
    return found;
  }
  if (typeof obj === 'object') {
    Object.entries(obj).forEach(([key, val]) => {
      if (shouldSkipKey(key)) return;
      const nextPath = path ? `${path}.${key}` : key;
      deepFindRenderable(val, nextPath, found);
    });
  }
  return found;
};

export const extractRenderableContentFromViewDocument = (raw: any): ExtractedRenderable => {
  const result: ExtractedRenderable = {};
  const { segmento, directArticulo, anexo } = getStructuredArticleSources(raw);
  const rootContent =
    raw?.document?.content ??
    raw?.data?.document?.content ??
    raw?.content ??
    raw?.data?.content ??
    null;
  const articles: SaijArticle[] = [];
  const leadBlocks: string[] = [];
  const seen = new Set<string>();
  const seenLead = new Set<string>();

  const pushLeadBlock = (value?: string | null, heading?: string | null) => {
    if (!value || typeof value !== 'string') return;
    let cleaned = cleanStructuredText(value);
    if (!cleaned) return;
    const leadOnly = extractLeadTextBeforeFirstArticle(cleaned);
    if (leadOnly) {
      cleaned = leadOnly;
    }
    if (!heading && /^\s*(?:art[íi]culo|art\.?)\s*\d+/i.test(cleaned)) {
      return;
    }
    const block = heading && heading.trim().length > 0 ? `${heading.trim()}\n${cleaned}` : cleaned;
    const dedupeKey = block.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!dedupeKey || seenLead.has(dedupeKey)) return;
    seenLead.add(dedupeKey);
    leadBlocks.push(block);
  };

  const pushArticle = (item: any, idx: number, headings: string[], path: string) => {
    const rawText =
      typeof item?.texto === 'string'
        ? item.texto
        : typeof item === 'string'
          ? item
          : null;
    if (!rawText) return;
    const cleaned = cleanStructuredText(rawText);
    if (!cleaned) return;
    if (!isLikelyArticleNode(item, cleaned, path)) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    const articleNormativeSections =
      item && typeof item === 'object'
        ? extractNormativeSectionEntries(item)
        : { normasQueModifica: [], normasComplementarias: [], observaciones: [] };
    let articleNormasQueModificaEntries = articleNormativeSections.normasQueModifica;
    let articleObservacionesEntries = articleNormativeSections.observaciones;
    let articleRelatedContents =
      item && typeof item === 'object'
        ? extractRelatedContentEntries(item)
        : [];
    if (isLikelyNormasQueModificaArticle(cleaned)) {
      if (!articleNormasQueModificaEntries.length) {
        articleNormasQueModificaEntries = dedupeRelatedItems([
          ...articleObservacionesEntries,
          ...articleRelatedContents,
        ]);
        articleObservacionesEntries = [];
        articleRelatedContents = [];
      }
    }
    articles.push({
      number: detectArticleNumber(cleaned, item, idx),
      title: buildStructuredArticleTitle(item, headings),
      text: cleaned,
      normasQueModifica: articleNormasQueModificaEntries.map(toResolvedLinkedRef),
      normasComplementarias: articleNormativeSections.normasComplementarias.map(toResolvedLinkedRef),
      observaciones: articleObservacionesEntries.map(toResolvedLinkedRef),
      relatedContents: articleRelatedContents.map(toResolvedLinkedRef),
    });
  };

  let structuredPath: string | null = null;
  const markStructuredPath = (path: string) => {
    if (!structuredPath) structuredPath = path;
  };

  if (rootContent && typeof rootContent === 'object') {
    const encabezadoRoot =
      normalizeLooseString((rootContent as any)?.encabezado) ??
      normalizeLooseString((rootContent as any)?.['encabezado']) ??
      normalizeLooseString((rootContent as any)?.generalidades?.encabezado) ??
      null;
    const temaRoot =
      normalizeLooseString((rootContent as any)?.tema) ??
      normalizeLooseString((rootContent as any)?.descriptores?.tema) ??
      normalizeLooseString((rootContent as any)?.generalidades?.sintesis) ??
      null;
    const decretaRoot =
      extractLeadSectionText(
        (rootContent as any)?.decreta ??
          (rootContent as any)?.resuelve ??
          (rootContent as any)?.['por-ello'] ??
          (rootContent as any)?.por_ello
      ) ??
      null;
    const indiceRoot =
      normalizeLooseString((rootContent as any)?.indice) ??
      null;
    const vistoRoot =
      extractLeadSectionText((rootContent as any)?.visto ?? (rootContent as any)?.vistos) ??
      null;
    const considerandoRoot =
      extractLeadSectionText((rootContent as any)?.considerando ?? (rootContent as any)?.considerandos) ??
      null;
    pushLeadBlock(encabezadoRoot, 'Encabezado');
    pushLeadBlock(indiceRoot, 'Indice');
    pushLeadBlock(vistoRoot, 'Visto');
    pushLeadBlock(considerandoRoot, 'Considerando');
    pushLeadBlock(decretaRoot, 'Por ello');
    pushLeadBlock(temaRoot, 'Tema');
  }

  const walkStructured = (node: any, path: string, headings: string[] = []) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach((item, idx) => walkStructured(item, `${path}[${idx}]`, headings));
      return;
    }

    if (typeof node === 'string') {
      pushArticle(node, 0, headings, path);
      markStructuredPath(path);
      return;
    }

    if (typeof node !== 'object') return;

    let nextHeadings = headings;
    nextHeadings = appendUniqueHeading(
      nextHeadings,
      normalizeHeadingText(node?.['titulo-anexo']) ??
      normalizeHeadingText(node?.anexo)
    );
    nextHeadings = appendUniqueHeading(
      nextHeadings,
      normalizeHeadingText(node?.['titulo-particion']) ??
      normalizeHeadingText(node?.['titulo-seccion']) ??
      normalizeHeadingText(node?.['titulo-capitulo'])
    );

    const vistoValue =
      extractLeadSectionText(node?.visto ?? node?.['visto'] ?? node?.vistos ?? node?.['vistos']) ??
      null;
    const considerandoValue =
      extractLeadSectionText(
        node?.considerando ?? node?.['considerando'] ?? node?.considerandos ?? node?.['considerandos']
      ) ??
      null;
    const indiceValue =
      normalizeLooseString(node?.indice) ??
      normalizeLooseString(node?.['indice']) ??
      null;
    const encabezadoValue =
      normalizeLooseString(node?.encabezado) ??
      normalizeLooseString(node?.['encabezado']) ??
      null;
    const temaValue =
      normalizeLooseString(node?.tema) ??
      normalizeLooseString(node?.['tema']) ??
      normalizeLooseString(node?.['tema-norma']) ??
      normalizeLooseString(node?.tema_norma) ??
      null;
    const decretaValue =
      extractLeadSectionText(node?.decreta ?? node?.resuelve ?? node?.['por-ello'] ?? node?.por_ello) ??
      null;
    pushLeadBlock(encabezadoValue, 'Encabezado');
    pushLeadBlock(indiceValue, 'Indice');
    pushLeadBlock(vistoValue, 'Visto');
    pushLeadBlock(considerandoValue, 'Considerando');
    pushLeadBlock(decretaValue, 'Por ello');
    pushLeadBlock(temaValue, 'Tema');

    if (typeof node?.texto === 'string') {
      const cleanedNodeText = cleanStructuredText(node.texto);
      if (cleanedNodeText && !isLikelyArticleNode(node, cleanedNodeText, path)) {
        pushLeadBlock(cleanedNodeText, null);
      }
      pushArticle(node, 0, nextHeadings, path);
      markStructuredPath(path);
    }

    const nestedArticulos = node?.articulo ?? node?.articulos ?? null;
    if (nestedArticulos) {
      if (Array.isArray(nestedArticulos)) {
        nestedArticulos.forEach((item: any, idx: number) => {
          if (typeof item === 'string' || typeof item?.texto === 'string') {
            pushArticle(item, idx, nextHeadings, `${path}.articulo[${idx}]`);
          } else {
            walkStructured(item, `${path}.articulo[${idx}]`, nextHeadings);
          }
        });
      } else if (typeof nestedArticulos === 'string' || typeof nestedArticulos?.texto === 'string') {
        pushArticle(nestedArticulos, 0, nextHeadings, `${path}.articulo`);
      } else {
        walkStructured(nestedArticulos, `${path}.articulo`, nextHeadings);
      }
      markStructuredPath(`${path}.articulo[]`);
    }

    const nestedSegmentos = node?.segmento ?? node?.segmentos ?? null;
    if (nestedSegmentos) {
      walkStructured(nestedSegmentos, `${path}.segmento`, nextHeadings);
    }
  };

  walkStructured(segmento, 'data.document.content.segmento');
  walkStructured(directArticulo, 'data.document.content.articulo');
  walkStructured(anexo, 'data.document.content.anexo');

  const leadText = leadBlocks.length > 0 ? leadBlocks.join('\n\n') : null;
  if (leadText) {
    result.leadText = leadText;
  }

  if (articles.length) {
    result.articles = articles;
    const articlesText = articles.map((article) => article.text).join('\n\n');
    result.contentText = leadText ? `${leadText}\n\n${articlesText}` : articlesText;
    result.contentHtml = null;
    result.sourcePath = structuredPath ?? 'data.document.content.articulo[]';
    result.fromArticulo = true;
    result.structuredArticlePath = structuredPath;
    result.structuredArticleCount = articles.length;
    result.toc = [];
    return result;
  }

  const candidate = deepFindRenderable(raw, 'data');

  if (candidate.contentHtml) result.contentHtml = candidate.contentHtml;
  if (candidate.contentText) result.contentText = candidate.contentText;
  if (candidate.sourcePath) result.sourcePath = candidate.sourcePath;

  const textForArticles = result.contentText || result.contentHtml;
  if (textForArticles) {
    result.articles = parseArticlesFromText(textForArticles);
  }
  result.toc = [];
  return result;
};

export const mapSaijDocument = (raw: any, options: MapDocOptions) => {
  const abstractObj = safeParseJson(typeof raw?.data === 'string' ? raw.data : undefined) ?? raw?.data ?? raw;
  const metadata = abstractObj?.document?.metadata ?? abstractObj?.metadata ?? {};
  const content = abstractObj?.document?.content ?? abstractObj?.content ?? {};

  const friendlyMeta = metadata['friendly-url'] ?? metadata['friendly_url'];
  const subdomain = friendlyMeta?.subdomain as string | undefined;
  const description = friendlyMeta?.description as string | undefined;
  const friendlyUrl =
    subdomain && description ? `https://www.saij.gob.ar/${subdomain}-${description}` : options.friendlyUrl ?? null;

  const actor = typeof content['actor'] === 'string' ? content['actor'] : null;
  const demandado = typeof content['demandado'] === 'string' ? content['demandado'] : null;
  const sobre = typeof content['sobre'] === 'string' ? content['sobre'] : null;
  const tituloSumario = normalizeTagText(typeof content['titulo'] === 'string' ? content['titulo'] : null);
  const tituloDoctrina = pickFirstString(content['titulo-doctrina'], (content as any)?.titulo_doctrina);
  const autorDoctrina = extractDoctrinaAuthor(content['autor-doctrina'] ?? (content as any)?.autor_doctrina);
  const publicacionDoctrina = pickFirstString(content['publicacion'], (content as any)?.publicacion);
  const fechaPublicacionRaw = content['fecha-publicacion'] ?? (content as any)?.fecha_publicacion ?? null;
  const fechaDoctrinaLabel = formatDoctrinaDate(fechaPublicacionRaw);
  const partesDictamen = pickFirstString(content['partes'], (content as any)?.partes);
  const dictamenNumberLabel = buildDictamenNumberLabel(content as Record<string, any>);
  const dictamenOrganismo = extractDictamenOrganismo(content as Record<string, any>);
  const caratula =
    normalizeSubtitleValue(content['caratula']) ??
    (typeof content['caratula'] === 'string' ? content['caratula'] : null) ??
    normalizeSubtitleValue(content['titulo']) ??
    (typeof content['titulo'] === 'string' ? content['titulo'] : null);

  const inferredDocContentType = normalizeContentType(
    metadata['document-content-type'] ?? raw?.contentType,
    'legislacion'
  );

  const resolvedFalloCaratula =
    inferredDocContentType === 'fallo'
      ? buildFalloCaratula(actor, demandado, sobre)
      : null;

  const title =
    (inferredDocContentType === 'sumario'
      ? tituloSumario ?? caratula
      : inferredDocContentType === 'dictamen'
        ? partesDictamen ?? caratula
      : inferredDocContentType === 'doctrina'
        ? tituloDoctrina ?? caratula
        : caratula) ??
    resolvedFalloCaratula ??
    content['titulo-norma'] ??
    content['nombre-coloquial'] ??
    prettifyFriendlyDescription(description) ??
    options.guid;

  const sumario = normalizeTagText(normalizeSubtitleValue(content['sumario']));

  const subtitle = (
    inferredDocContentType === 'sumario'
      ? joinNonEmpty([
          'SUMARIO DE FALLO',
          formatDateShort(typeof content['fecha'] === 'string' ? content['fecha'] : null),
          typeof content['id-infojus'] === 'string'
            ? `Id SAIJ: ${content['id-infojus']}`
            : typeof content['numero-sumario'] === 'string'
              ? `Id SAIJ: ${content['numero-sumario']}`
              : null,
        ], ' · ')
      : inferredDocContentType === 'doctrina'
        ? joinNonEmpty([
            'Doctrina',
            autorDoctrina,
            publicacionDoctrina,
            fechaDoctrinaLabel,
          ], '. ')
      : inferredDocContentType === 'dictamen'
        ? joinNonEmpty([dictamenNumberLabel, dictamenOrganismo], '. ')
      : truncate(sumario ?? undefined, 180) ??
        joinNonEmpty([
          content['tipo-norma']?.texto,
          content['fecha'],
          content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
        ])
  );

  const contentType = inferredDocContentType;
  const documentSubtype =
    (contentType === 'legislacion'
      ? normalizeLooseString(
          content['tipo-norma']?.texto ??
            content['tipo-norma'] ??
            (content as any)?.tipo_norma?.texto ??
            (content as any)?.tipo_norma
        )
      : contentType === 'fallo'
        ? normalizeLooseString(content['tipo-fallo'] ?? (content as any)?.tipo_fallo)
        : contentType === 'sumario'
          ? normalizeLooseString(content['tipo-sumario'] ?? (content as any)?.tipo_sumario) ?? 'Sumario de Fallo'
          : contentType === 'dictamen'
            ? 'Dictamen'
            : contentType === 'doctrina'
              ? 'Doctrina'
              : null) ?? null;
  const estadoVigencia =
    normalizeLooseString(
      content['estado']?.texto ?? content['estado'] ?? (content as any)?.estado_vigencia?.texto ?? (content as any)?.estado_vigencia
    ) ?? null;
  const tribunal = normalizeLooseString(content['tribunal'] ?? (content as any)?.tribunal) ?? null;
  const fechaSentencia = normalizeLooseString(content['fecha'] ?? (content as any)?.fecha) ?? null;
  const autor = contentType === 'doctrina' ? autorDoctrina ?? null : null;
  const organismo = contentType === 'dictamen' ? dictamenOrganismo ?? null : null;

  const textoDoc =
    (content as any)?.['texto-doc'] ??
    (content as any)?.texto_doc ??
    (content as any)?.['texto-original'] ??
    (content as any)?.texto_original ??
    null;
  const attachmentGuid =
    typeof textoDoc?.uuid === 'string'
      ? textoDoc.uuid
      : null;
  const attachmentFileName =
    typeof textoDoc?.['file-name'] === 'string'
      ? textoDoc['file-name']
      : typeof textoDoc?.fileName === 'string'
        ? textoDoc.fileName
        : null;
  const attachment =
    attachmentGuid || attachmentFileName
      ? {
          guid: attachmentGuid,
          fileName: attachmentFileName,
          // Ruta observada en SAIJ para adjuntos PDF.
          url:
            attachmentGuid && attachmentFileName
              ? `https://www.saij.gob.ar/descarga-archivo?guid=${attachmentGuid}&name=${encodeURIComponent(
                  attachmentFileName.toLowerCase()
                )}`
              : attachmentGuid
                ? `https://www.saij.gob.ar/descarga-archivo?guid=${attachmentGuid}`
                : null,
          // Fallback de descarga con nombre original por si el servidor es case-sensitive.
          fallbackUrl:
            attachmentGuid && attachmentFileName
              ? `https://www.saij.gob.ar/descarga-archivo?guid=${attachmentGuid}&name=${encodeURIComponent(
                  attachmentFileName
                )}`
              : attachmentGuid
                ? `https://www.saij.gob.ar/view-document?guid=${attachmentGuid}`
                : null,
        }
      : null;

  const normativeSections = extractNormativeSectionEntries(content);
  const normasQueModifica = normativeSections.normasQueModifica.map((item) => ({
    title: item.title,
    subtitle: item.subtitle ?? null,
    contentTypeHint: item.contentTypeHint,
    guid: item.guid ?? null,
    sourceUrl: item.sourceUrl ?? null,
    url: item.sourceUrl ?? buildSearchUrlByHint(item.title, item.contentTypeHint),
  }));
  const normasComplementarias = normativeSections.normasComplementarias.map((item) => ({
    title: item.title,
    subtitle: item.subtitle ?? null,
    contentTypeHint: item.contentTypeHint,
    guid: item.guid ?? null,
    sourceUrl: item.sourceUrl ?? null,
    url: item.sourceUrl ?? buildSearchUrlByHint(item.title, item.contentTypeHint),
  }));
  const observaciones = normativeSections.observaciones.map((item) => ({
    title: item.title,
    subtitle: item.subtitle ?? null,
    contentTypeHint: item.contentTypeHint,
    guid: item.guid ?? null,
    sourceUrl: item.sourceUrl ?? null,
    url: item.sourceUrl ?? buildSearchUrlByHint(item.title, item.contentTypeHint),
  }));

  const relatedContents = extractRelatedContentEntries(content).map((item) => ({
    title: item.title,
    subtitle: item.subtitle ?? null,
    contentTypeHint: item.contentTypeHint,
    guid: item.guid ?? null,
    sourceUrl: item.sourceUrl ?? null,
    url: item.sourceUrl ?? buildSearchUrlByHint(item.title, item.contentTypeHint),
  }));
  const extractedRelatedFallos = extractRelatedFalloEntries(content).map((item) => ({
    title: item.title,
    subtitle: item.subtitle ?? null,
    guid: item.guid ?? null,
    sourceUrl: item.sourceUrl ?? null,
    url: item.sourceUrl ?? buildFalloSearchUrl(item.title),
  }));
  const rawHtml = (abstractObj as any)?.html ?? options.fallbackHtml ?? null;
  const contentHtmlBase = extractMainHtml(rawHtml);
  const rawSintesis =
    normalizeTagText(typeof content['sintesis'] === 'string' ? content['sintesis'] : null) ??
    normalizeTagText(typeof (content as any)?.sintesis === 'string' ? (content as any).sintesis : null) ??
    null;
  const rawTexto =
    normalizeTagText(typeof content['texto'] === 'string' ? content['texto'] : null) ??
    normalizeTagText(typeof content['texto-fallo'] === 'string' ? content['texto-fallo'] : null) ??
    normalizeTagText(typeof (content as any)?.texto_fallo === 'string' ? (content as any).texto_fallo : null) ??
    null;
  const rawSumario =
    normalizeTagText(normalizeSubtitleValue(content['sumario'])) ??
    normalizeTagText(typeof content['sumario'] === 'string' ? content['sumario'] : null) ??
    null;
  let contentTextBase =
    htmlToText(contentHtmlBase) ??
    rawTexto ??
    rawSintesis ??
    rawSumario ??
    null;
  if (inferredDocContentType === 'fallo') {
    const falloDetailText = buildFalloDetailText(content as Record<string, any>, metadata as Record<string, any>);
    if (falloDetailText) {
      contentTextBase = falloDetailText;
    } else {
      contentTextBase = rawTexto ?? rawSumario ?? contentTextBase;
    }
  }
  if (inferredDocContentType === 'dictamen') {
    const dictamenDetailText = buildDictamenDetailText(content as Record<string, any>);
    if (dictamenDetailText) {
      contentTextBase = dictamenDetailText;
    } else {
      contentTextBase = rawTexto ?? rawSintesis ?? rawSumario ?? contentTextBase;
    }
  }
  const fuenteSumario =
    inferredDocContentType === 'sumario' && typeof content['fuente'] === 'string'
      ? normalizeTagText(content['fuente'])
      : null;
  if (
    inferredDocContentType === 'sumario' &&
    typeof contentTextBase === 'string' &&
    contentTextBase.trim().length > 0 &&
    fuenteSumario
  ) {
    contentTextBase = `${contentTextBase}\n\nFuente del sumario: ${fuenteSumario}`;
  }
  const fallbackFalloAplicaCaratula =
    inferredDocContentType === 'sumario' && typeof content['caratula'] === 'string'
      ? normalizeTagText(content['caratula'])
      : null;
  const fallbackFalloAplicaMeta =
    inferredDocContentType === 'sumario'
      ? joinNonEmpty([
          typeof content['tipo-fallo'] === 'string' ? normalizeTagText(content['tipo-fallo']) : null,
          typeof content['tribunal'] === 'string' ? normalizeTagText(content['tribunal']) : null,
          formatDateShort(typeof content['fecha'] === 'string' ? content['fecha'] : null),
        ], '. ')
      : null;
  const relatedFallos =
    extractedRelatedFallos.length > 0
      ? extractedRelatedFallos
      : fallbackFalloAplicaCaratula
        ? [
            {
              title: fallbackFalloAplicaCaratula,
              subtitle: fallbackFalloAplicaMeta,
              guid: null,
              sourceUrl: null,
              url: buildFalloSearchUrl(fallbackFalloAplicaCaratula),
            },
          ]
        : [];
  const shouldRenderArticleBlocks = inferredDocContentType === 'legislacion';
  const articlesBase = shouldRenderArticleBlocks ? parseArticlesFromText(contentTextBase) : [];

  const deep = extractRenderableContentFromViewDocument(abstractObj);

  const fromArticulo = deep.fromArticulo === true;
  const contentHtml = fromArticulo ? null : contentHtmlBase || deep.contentHtml || null;
  const contentText = fromArticulo ? deep.contentText || contentTextBase || null : contentTextBase || deep.contentText || null;
  const headerText = pickBestHeaderText(
    deep.leadText ?? null,
    extractLeadTextBeforeFirstArticle(contentTextBase),
    extractLeadTextBeforeFirstArticle(deep.contentText ?? null),
    extractLeadTextBeforeFirstArticle(contentText)
  );
  const articles = fromArticulo
    ? shouldRenderArticleBlocks
      ? deep.articles || []
      : []
    : shouldRenderArticleBlocks
      ? (articlesBase.length ? articlesBase : deep.articles) || []
      : [];

  const toc = [] as { label: string; anchor?: string }[];

  let primaryTextWasRejectedAsMetadataOnly = false;
  let rejectedTextReason: string | null = null;

  const textSourcePath = contentTextBase && contentHtmlBase ? 'html' : contentTextBase ? 'content.texto' : deep.sourcePath ?? undefined;
  let contentHtmlFinal = contentHtml;
  let contentTextFinal = contentText;
  let articlesFinal = articles;
  let headerTextFinal = headerText;

  if (!fromArticulo && contentType === 'legislacion' && contentTextFinal) {
    const analysis = analyzeLegalBodyText(contentTextFinal, textSourcePath);
    if (!analysis.ok) {
      primaryTextWasRejectedAsMetadataOnly = true;
      rejectedTextReason = analysis.reason;
      contentTextFinal = null;
      articlesFinal = [];
    }
  }

  if (!fromArticulo && contentType === 'legislacion' && !contentTextFinal && contentHtmlFinal) {
    const htmlText =
      htmlToText(contentHtmlFinal) ??
      contentHtmlFinal.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (htmlText) {
      const analysis = analyzeLegalBodyText(htmlText, 'html');
      if (analysis.ok) {
        contentTextFinal = htmlText;
        articlesFinal = parseArticlesFromText(htmlText);
      } else {
        primaryTextWasRejectedAsMetadataOnly = true;
        rejectedTextReason = analysis.reason;
        contentHtmlFinal = null;
        contentTextFinal = null;
        articlesFinal = [];
      }
    }
  }

  if (contentType === 'legislacion' && Array.isArray(articlesFinal) && articlesFinal.length > 0) {
    articlesFinal = articlesFinal.map((article: any) => ({
      ...article,
      number: normalizeArticleNumberToken(String(article?.number || '')) || String(article?.number || '').trim(),
      text: cleanStructuredText(String(article?.text || '')),
    }));
  }

  if (contentType === 'legislacion' && isCivilCommercialCodeTitle(title) && Array.isArray(articlesFinal) && articlesFinal.length > 0) {
    let firstAnnexIndex = articlesFinal.findIndex((article: any) => isAnnexHeading(article?.title));
    if (firstAnnexIndex <= 0) {
      firstAnnexIndex = articlesFinal.findIndex((article: any, index: number) => {
        if (index < 1) return false;
        return normalizeComparableText(String(article?.number || '')) === '1';
      });
    }
    if (firstAnnexIndex > 0) {
      const preludeArticles = articlesFinal.slice(0, firstAnnexIndex);
      const annexArticles = articlesFinal.slice(firstAnnexIndex);
      const preludeText = preludeArticles
        .map((article: any) => {
          const header = buildArticleHeaderLine(article?.number);
          const body = stripArticleLeadFromText(article?.text) || cleanStructuredText(String(article?.text || ''));
          return body ? `${header}\n${body}` : header;
        })
        .filter(Boolean)
        .join('\n\n');

      if (preludeText) {
        headerTextFinal = pickBestHeaderText(headerTextFinal, preludeText) ?? preludeText;
      }

      if (annexArticles.length > 0) {
        articlesFinal = annexArticles;
        const annexText = annexArticles.map((article: any) => cleanStructuredText(String(article?.text || ''))).join('\n\n').trim();
        if (annexText.length > 0) contentTextFinal = annexText;
      }
    }
  }

  const articleNormasQueModifica = dedupeLinkedRefs(
    articlesFinal.flatMap((article: any) => (Array.isArray(article?.normasQueModifica) ? article.normasQueModifica : []))
  );
  const articleNormasComplementarias = dedupeLinkedRefs(
    articlesFinal.flatMap((article: any) =>
      Array.isArray(article?.normasComplementarias) ? article.normasComplementarias : []
    )
  );
  const articleObservaciones = dedupeLinkedRefs(
    articlesFinal.flatMap((article: any) => (Array.isArray(article?.observaciones) ? article.observaciones : []))
  );
  const articleRelatedContents = dedupeLinkedRefs(
    articlesFinal.flatMap((article: any) => (Array.isArray(article?.relatedContents) ? article.relatedContents : []))
  );

  const normasQueModificaFinal = normasQueModifica.length > 0 ? normasQueModifica : articleNormasQueModifica;
  const normasComplementariasFinal =
    normasComplementarias.length > 0 ? normasComplementarias : articleNormasComplementarias;
  const observacionesFinal = observaciones.length > 0 ? observaciones : articleObservaciones;
  const relatedContentsFinal = relatedContents.length > 0 ? relatedContents : articleRelatedContents;

  return {
    guid: options.guid,
    title,
    subtitle,
    contentType,
    documentSubtype,
    estadoVigencia,
    tribunal,
    fechaSentencia,
    autor,
    organismo,
    metadata,
    contentHtml: contentHtmlFinal,
    contentText: contentTextFinal,
    headerText: headerTextFinal,
    articles: articlesFinal,
    toc,
    friendlyUrl,
    sourceUrl: friendlyUrl,
    friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
    attachment,
    normasQueModifica: normasQueModificaFinal,
    normasComplementarias: normasComplementariasFinal,
    observaciones: observacionesFinal,
    relatedFallos,
    relatedContents: relatedContentsFinal,
    _contentSource: deep.sourcePath,
    _primaryTextWasRejectedAsMetadataOnly: primaryTextWasRejectedAsMetadataOnly,
    _rejectedTextReason: rejectedTextReason,
    _structuredArticleSourceUsed: fromArticulo,
    _structuredArticlePath: deep.structuredArticlePath ?? null,
    _structuredArticleCount: deep.structuredArticleCount ?? (fromArticulo ? articlesFinal.length : 0),
  };
};

export const isDocumentContentEmpty = (doc: {
  contentHtml?: string | null;
  contentText?: string | null;
  articles?: { number: string; title: string | null; text: string }[];
}) => {
  const noHtml = !doc.contentHtml || doc.contentHtml.trim().length === 0;
  const noText = !doc.contentText || doc.contentText.trim().length === 0;
  const noArticles = !doc.articles || doc.articles.length === 0;
  return noHtml && noText && noArticles;
};

export const mergeDocumentContent = (
  baseDoc: ReturnType<typeof mapSaijDocument>,
  fallbackDoc: ReturnType<typeof mapSaijDocument>
) => {
  return {
    ...baseDoc,
    title: baseDoc.title || fallbackDoc.title,
    subtitle: baseDoc.subtitle || fallbackDoc.subtitle,
    documentSubtype: (baseDoc as any).documentSubtype || (fallbackDoc as any).documentSubtype || null,
    estadoVigencia: (baseDoc as any).estadoVigencia || (fallbackDoc as any).estadoVigencia || null,
    tribunal: (baseDoc as any).tribunal || (fallbackDoc as any).tribunal || null,
    fechaSentencia: (baseDoc as any).fechaSentencia || (fallbackDoc as any).fechaSentencia || null,
    autor: (baseDoc as any).autor || (fallbackDoc as any).autor || null,
    organismo: (baseDoc as any).organismo || (fallbackDoc as any).organismo || null,
    metadata: Object.keys(baseDoc.metadata || {}).length ? baseDoc.metadata : fallbackDoc.metadata,
    contentHtml: baseDoc.contentHtml || fallbackDoc.contentHtml,
    contentText: baseDoc.contentText || fallbackDoc.contentText,
    headerText: (baseDoc as any).headerText || (fallbackDoc as any).headerText || null,
    articles: baseDoc.articles && baseDoc.articles.length ? baseDoc.articles : fallbackDoc.articles,
    toc: baseDoc.toc && baseDoc.toc.length ? baseDoc.toc : fallbackDoc.toc,
    friendlyUrl: baseDoc.friendlyUrl || fallbackDoc.friendlyUrl,
    sourceUrl: baseDoc.sourceUrl || fallbackDoc.sourceUrl,
    attachment: (baseDoc as any).attachment || (fallbackDoc as any).attachment || null,
    normasQueModifica:
      Array.isArray((baseDoc as any).normasQueModifica) && (baseDoc as any).normasQueModifica.length
        ? (baseDoc as any).normasQueModifica
        : Array.isArray((fallbackDoc as any).normasQueModifica)
          ? (fallbackDoc as any).normasQueModifica
          : [],
    normasComplementarias:
      Array.isArray((baseDoc as any).normasComplementarias) && (baseDoc as any).normasComplementarias.length
        ? (baseDoc as any).normasComplementarias
        : Array.isArray((fallbackDoc as any).normasComplementarias)
          ? (fallbackDoc as any).normasComplementarias
          : [],
    observaciones:
      Array.isArray((baseDoc as any).observaciones) && (baseDoc as any).observaciones.length
        ? (baseDoc as any).observaciones
        : Array.isArray((fallbackDoc as any).observaciones)
          ? (fallbackDoc as any).observaciones
          : [],
    relatedFallos:
      Array.isArray((baseDoc as any).relatedFallos) && (baseDoc as any).relatedFallos.length
        ? (baseDoc as any).relatedFallos
        : Array.isArray((fallbackDoc as any).relatedFallos)
          ? (fallbackDoc as any).relatedFallos
          : [],
    relatedContents:
      Array.isArray((baseDoc as any).relatedContents) && (baseDoc as any).relatedContents.length
        ? (baseDoc as any).relatedContents
        : Array.isArray((fallbackDoc as any).relatedContents)
          ? (fallbackDoc as any).relatedContents
          : [],
    _primaryTextWasRejectedAsMetadataOnly:
      (baseDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      (fallbackDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      false,
    _rejectedTextReason: (baseDoc as any)._rejectedTextReason ?? (fallbackDoc as any)._rejectedTextReason ?? null,
  };
};
