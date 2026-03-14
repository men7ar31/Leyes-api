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

  const subtitle =
    truncate(content['sumario'], 180) ??
    joinNonEmpty([
      content['tipo-norma']?.texto,
      content['fecha'],
      content['jurisdiccion']?.provincia ?? content['jurisdiccion']?.descripcion,
    ]);

  const summary = content['sumario'] ?? null;

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
      const nextPath = path ? `${path}.${key}` : key;
      deepFindRenderable(val, nextPath, found);
    });
  }
  return found;
};

export const extractRenderableContentFromViewDocument = (raw: any): ExtractedRenderable => {
  const result: ExtractedRenderable = {};
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

  const subtitle =
    truncate(content['sumario'], 180) ??
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

  const contentHtml = contentHtmlBase || deep.contentHtml || null;
  const contentText = contentTextBase || deep.contentText || null;
  const articles = (articlesBase.length ? articlesBase : deep.articles) || [];

  const toc = [] as { label: string; anchor?: string }[];

  return {
    guid: options.guid,
    title,
    subtitle,
    contentType,
    metadata,
    contentHtml,
    contentText,
    articles,
    toc,
    friendlyUrl,
    sourceUrl: friendlyUrl,
    friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
    _contentSource: deep.sourcePath,
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
  };
};
