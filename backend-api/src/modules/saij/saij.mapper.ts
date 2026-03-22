import { logger } from '../../utils/logger';
import { SaijContentType, SaijSearchHit, SaijSearchHitRaw, SaijArticle } from './saij.types';

const normalizeContentType = (value: any, fallback: SaijContentType): SaijContentType => {
  const normalized = String(value || '').toLowerCase();
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

  const title = (
    content['titulo-norma'] ??
    content['nombre-coloquial'] ??
    prettifyFriendlyDescription(description) ??
    (raw as any).uuid ??
    ''
  );

  const sumario = normalizeSubtitleValue(content['sumario']);

  const subtitle =
    truncate(sumario ?? undefined, 180) ??
    joinNonEmpty([
      content['tipo-norma']?.texto,
      content['fecha'],
      content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
    ]);

  const summary = sumario ?? null;

  const inferredContentType =
    metadata['document-content-type'] ??
    (abstractObj as any)?.['document-content-type'] ??
    raw.documentContentType;

  const contentType = normalizeContentType(inferredContentType, fallbackContentType);

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
  return { segmento, directArticulo };
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
  const { segmento, directArticulo } = getStructuredArticleSources(raw);
  const articles: SaijArticle[] = [];
  const seen = new Set<string>();

  const pushArticle = (item: any, idx: number) => {
    const rawText =
      typeof item?.texto === 'string'
        ? item.texto
        : typeof item === 'string'
          ? item
          : null;
    if (!rawText) return;
    const cleaned = cleanStructuredText(rawText);
    if (!cleaned) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    articles.push({
      number: detectArticleNumber(cleaned, item, idx),
      title: null,
      text: cleaned,
    });
  };

  let structuredPath: string | null = null;
  const markStructuredPath = (path: string) => {
    if (!structuredPath) structuredPath = path;
  };

  const walkStructured = (node: any, path: string) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach((item, idx) => walkStructured(item, `${path}[${idx}]`));
      return;
    }

    if (typeof node === 'string') {
      pushArticle(node, 0);
      markStructuredPath(path);
      return;
    }

    if (typeof node !== 'object') return;

    if (typeof node?.texto === 'string') {
      pushArticle(node, 0);
      markStructuredPath(path);
    }

    const nestedArticulos = node?.articulo ?? node?.articulos ?? null;
    if (nestedArticulos) {
      if (Array.isArray(nestedArticulos)) {
        nestedArticulos.forEach((item: any, idx: number) => {
          if (typeof item === 'string' || typeof item?.texto === 'string') {
            pushArticle(item, idx);
          } else {
            walkStructured(item, `${path}.articulo[${idx}]`);
          }
        });
      } else if (typeof nestedArticulos === 'string' || typeof nestedArticulos?.texto === 'string') {
        pushArticle(nestedArticulos, 0);
      } else {
        walkStructured(nestedArticulos, `${path}.articulo`);
      }
      markStructuredPath(`${path}.articulo[]`);
    }

    const nestedSegmentos = node?.segmento ?? node?.segmentos ?? null;
    if (nestedSegmentos) {
      walkStructured(nestedSegmentos, `${path}.segmento`);
    }
  };

  walkStructured(segmento, 'data.document.content.segmento');
  walkStructured(directArticulo, 'data.document.content.articulo');

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

  const title =
    content['titulo-norma'] ??
    content['nombre-coloquial'] ??
    prettifyFriendlyDescription(description) ??
    options.guid;

  const sumario = normalizeSubtitleValue(content['sumario']);

  const subtitle =
    truncate(sumario ?? undefined, 180) ??
    joinNonEmpty([
      content['tipo-norma']?.texto,
      content['fecha'],
      content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
    ]);

  const contentType = normalizeContentType(
    metadata['document-content-type'] ?? raw?.contentType,
    'legislacion'
  );

  const rawHtml = (abstractObj as any)?.html ?? options.fallbackHtml ?? null;
  const contentHtmlBase = extractMainHtml(rawHtml);
  const contentTextBase = htmlToText(contentHtmlBase) ?? content['texto'] ?? null;
  const articlesBase = parseArticlesFromText(contentTextBase);

  const deep = extractRenderableContentFromViewDocument(abstractObj);

  const fromArticulo = deep.fromArticulo === true;
  const contentHtml = fromArticulo ? null : contentHtmlBase || deep.contentHtml || null;
  const contentText = fromArticulo ? deep.contentText || null : contentTextBase || deep.contentText || null;
  const articles = fromArticulo ? deep.articles || [] : (articlesBase.length ? articlesBase : deep.articles) || [];

  const toc = [] as { label: string; anchor?: string }[];

  let primaryTextWasRejectedAsMetadataOnly = false;
  let rejectedTextReason: string | null = null;

  const textSourcePath = contentTextBase && contentHtmlBase ? 'html' : contentTextBase ? 'content.texto' : deep.sourcePath ?? undefined;
  let contentHtmlFinal = contentHtml;
  let contentTextFinal = contentText;
  let articlesFinal = articles;

  if (!fromArticulo && contentTextFinal) {
    const analysis = analyzeLegalBodyText(contentTextFinal, textSourcePath);
    if (!analysis.ok) {
      primaryTextWasRejectedAsMetadataOnly = true;
      rejectedTextReason = analysis.reason;
      contentTextFinal = null;
      articlesFinal = [];
    }
  }

  if (!fromArticulo && !contentTextFinal && contentHtmlFinal) {
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
    _primaryTextWasRejectedAsMetadataOnly:
      (baseDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      (fallbackDoc as any)._primaryTextWasRejectedAsMetadataOnly ??
      false,
    _rejectedTextReason: (baseDoc as any)._rejectedTextReason ?? (fallbackDoc as any)._rejectedTextReason ?? null,
  };
};
