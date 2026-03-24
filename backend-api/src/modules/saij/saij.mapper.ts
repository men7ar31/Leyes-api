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

const pickFirstString = (...values: any[]): string | null => {
  for (const value of values) {
    const normalized = normalizeLooseString(value);
    if (normalized && normalized.trim().length > 0) return normalized;
  }
  return null;
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

  return null;
};

const isHumanReadableRelatedLine = (value: string): boolean => {
  const line = value.trim();
  if (!line) return false;
  if (/^REFERENCIAS?_NORMATIVAS?/i.test(line)) return false;
  if (line.includes('_')) return false;
  if (line.length > 220) return false;
  if (/^[A-Z0-9 .\-\/]+$/.test(line) && /\d{4,}/.test(line) && !/[.,]/.test(line) && !/[a-záéíóúñ]/i.test(line)) {
    return false;
  }
  return true;
};

const extractRelatedContentLines = (content: any): string[] => {
  const lines: string[] = [];
  const pushLine = (value?: string | null) => {
    const cleaned = normalizeTagText(value);
    if (!cleaned) return;
    if (!isHumanReadableRelatedLine(cleaned)) return;
    lines.push(cleaned);
  };

  const walkReferences = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walkReferences);
      return;
    }
    if (typeof node !== 'object') return;

    if (typeof node.cr === 'string') {
      pushLine(node.cr);
    }
    if (typeof node.ref === 'string') {
      const parsed = parseNormativeRefCode(node.ref);
      if (parsed) pushLine(parsed);
    }

    Object.values(node).forEach(walkReferences);
  };

  const walkLabeledNodes = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walkLabeledNodes);
      return;
    }
    if (typeof node !== 'object') return;

    if (typeof node.titulo === 'string') pushLine(node.titulo);
    if (typeof node.caratula === 'string') pushLine(node.caratula);
    if (typeof node.descripcion === 'string') pushLine(node.descripcion);
    if (typeof node.nombre === 'string') pushLine(node.nombre);

    Object.values(node).forEach(walkLabeledNodes);
  };

  walkReferences(content?.['referencias-normativas'] ?? content?.referencias_normativas ?? null);
  walkLabeledNodes(content?.['contenido-relacionado'] ?? content?.contenido_relacionado ?? content?.contenidoRelacionados ?? null);
  walkLabeledNodes(content?.['fallos-a-los-que-aplica'] ?? content?.fallos_a_los_que_aplica ?? null);
  walkLabeledNodes(content?.['fallos-relacionados'] ?? content?.fallos_relacionados ?? null);
  extractInlineReferenceLabels(content?.texto).forEach(pushLine);

  const unique = Array.from(new Set(lines.filter((line) => line.length > 0)));
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, ' ').trim();
  const compact = unique.filter((candidate, idx) => {
    const candNorm = normalized(candidate);
    if (!candNorm) return false;
    return !unique.some((other, j) => {
      if (j === idx) return false;
      const otherNorm = normalized(other);
      if (!otherNorm) return false;
      return otherNorm.length > candNorm.length && otherNorm.includes(candNorm);
    });
  });
  return compact;
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
  const caratula =
    normalizeSubtitleValue(content['caratula']) ??
    (typeof content['caratula'] === 'string' ? content['caratula'] : null) ??
    (contentType === 'fallo' ? buildFalloCaratula(actor, demandado, sobre) : null);

  const title = (
    (contentType === 'sumario' ? tituloSumario ?? caratula : caratula) ??
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

  const subtitle =
    (contentType === 'fallo'
      ? falloSubtitle
      : contentType === 'sumario'
        ? sumarioSubtitle
      : truncate(sumario ?? undefined, 180) ??
        joinNonEmpty([
          content['tipo-norma']?.texto,
          content['numero-sumario'],
          content['fecha'],
          content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
        ])) ?? null;

  const summary =
    contentType === 'sumario'
      ? rawSummaryText ?? sumario
      : sumario ?? rawSummaryText;

  return {
    guid: (raw as any).uuid ?? raw.guid ?? raw.id ?? '',
    title,
    subtitle,
    summary,
    contentType,
    fecha: content['fecha'] ?? null,
    estado: content['estado'] ?? null,
    jurisdiccion:
      content['jurisdiccion']?.provincia ??
      content['jurisdiccion']?.descripcion ??
      null,
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

type MapDocOptions = { guid: string; fallbackHtml?: string; friendlyUrl?: string };

export type ExtractedRenderable = {
  contentHtml?: string | null;
  contentText?: string | null;
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
    const normalized = String(fromItem).trim();
    if (normalized.length > 0) return normalized;
  }
  const match = text.match(/^\s*(?:art[íi]culo|art\.?)\s*(\d+[a-zA-Z]?(?:\s*bis)?)\b/i);
  if (match && match[1]) return match[1];
  return typeof index === 'number' ? String(index + 1) : '';
};

const normalizeHeadingText = (value: any): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = cleanStructuredText(value).replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned : null;
};

const appendUniqueHeading = (headings: string[], value: string | null) => {
  if (!value) return headings;
  if (headings.some((item) => item.toLowerCase() === value.toLowerCase())) return headings;
  return [...headings, value];
};

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
  const articles: SaijArticle[] = [];
  const seen = new Set<string>();

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
    articles.push({
      number: detectArticleNumber(cleaned, item, idx),
      title: buildStructuredArticleTitle(item, headings),
      text: cleaned,
    });
  };

  let structuredPath: string | null = null;
  const markStructuredPath = (path: string) => {
    if (!structuredPath) structuredPath = path;
  };

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

    if (typeof node?.texto === 'string') {
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

  if (articles.length) {
    result.articles = articles;
    result.contentText = articles.map((article) => article.text).join('\n\n');
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
    (inferredDocContentType === 'sumario' ? tituloSumario ?? caratula : caratula) ??
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
      : truncate(sumario ?? undefined, 180) ??
        joinNonEmpty([
          content['tipo-norma']?.texto,
          content['fecha'],
          content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
        ])
  );

  const contentType = inferredDocContentType;

  const textoDoc = (content as any)?.['texto-doc'] ?? (content as any)?.texto_doc ?? null;
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

  const relatedReferenceLines = extractRelatedContentLines(content);
  const rawHtml = (abstractObj as any)?.html ?? options.fallbackHtml ?? null;
  const contentHtmlBase = extractMainHtml(rawHtml);
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
  if (
    inferredDocContentType === 'sumario' &&
    typeof contentTextBase === 'string' &&
    contentTextBase.trim().length > 0 &&
    relatedReferenceLines.length > 0
  ) {
    contentTextBase = `${contentTextBase}\n\nCONTENIDO RELACIONADO\n${relatedReferenceLines.map((line) => `- ${line}`).join('\n')}`;
  }
  const falloAplicaCaratula =
    inferredDocContentType === 'sumario' && typeof content['caratula'] === 'string'
      ? normalizeTagText(content['caratula'])
      : null;
  const falloAplicaMeta =
    inferredDocContentType === 'sumario'
      ? joinNonEmpty([
          typeof content['tipo-fallo'] === 'string' ? normalizeTagText(content['tipo-fallo']) : null,
          typeof content['tribunal'] === 'string' ? normalizeTagText(content['tribunal']) : null,
          formatDateShort(typeof content['fecha'] === 'string' ? content['fecha'] : null),
        ], '. ')
      : null;
  const relatedFallos =
    inferredDocContentType === 'sumario' && falloAplicaCaratula
      ? [
          {
            title: falloAplicaCaratula,
            subtitle: falloAplicaMeta,
            guid: null,
            sourceUrl: null,
            url: buildFalloSearchUrl(falloAplicaCaratula),
          },
        ]
      : [];
  const shouldRenderArticleBlocks = inferredDocContentType === 'legislacion';
  const articlesBase = shouldRenderArticleBlocks ? parseArticlesFromText(contentTextBase) : [];

  const deep = extractRenderableContentFromViewDocument(abstractObj);

  const fromArticulo = deep.fromArticulo === true;
  const contentHtml = fromArticulo ? null : contentHtmlBase || deep.contentHtml || null;
  const contentText = fromArticulo ? deep.contentText || null : contentTextBase || deep.contentText || null;
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

  return {
    guid: options.guid,
    title,
    subtitle,
    contentType,
    metadata,
    contentHtml: contentHtmlFinal,
    contentText: contentTextFinal,
    articles: articlesFinal,
    toc,
    friendlyUrl,
    sourceUrl: friendlyUrl,
    friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
    attachment,
    relatedFallos,
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
    metadata: Object.keys(baseDoc.metadata || {}).length ? baseDoc.metadata : fallbackDoc.metadata,
    contentHtml: baseDoc.contentHtml || fallbackDoc.contentHtml,
    contentText: baseDoc.contentText || fallbackDoc.contentText,
    articles: baseDoc.articles && baseDoc.articles.length ? baseDoc.articles : fallbackDoc.articles,
    toc: baseDoc.toc && baseDoc.toc.length ? baseDoc.toc : fallbackDoc.toc,
    friendlyUrl: baseDoc.friendlyUrl || fallbackDoc.friendlyUrl,
    sourceUrl: baseDoc.sourceUrl || fallbackDoc.sourceUrl,
    attachment: (baseDoc as any).attachment || (fallbackDoc as any).attachment || null,
    _primaryTextWasRejectedAsMetadataOnly:
      (baseDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      (fallbackDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      false,
    _rejectedTextReason: (baseDoc as any)._rejectedTextReason ?? (fallbackDoc as any)._rejectedTextReason ?? null,
  };
};
