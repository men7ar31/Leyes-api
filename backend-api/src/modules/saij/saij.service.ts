import { logger } from '../../utils/logger';
import { hashString } from '../../utils/hash';
import { CacheService } from '../cache/cache.service';
import { SaijCache } from './saij.cache';
import { SaijClient } from './saij.client';
import { buildSaijQuery } from './saij.query-builder';
import { mapSaijSearchHit, mapSaijDocument, isDocumentContentEmpty, mergeDocumentContent, isLikelyLegalBodyText } from './saij.mapper';
import { SaijSearchRequest, SaijSearchResponse, SaijDocumentResponse } from './saij.types';
import { SEARCH_CACHE_TTL_MS, DOCUMENT_CACHE_TTL_MS } from './saij.constants';
import { HttpError } from '../../utils/httpError';
import { NormService } from '../norms/norm.service';

const cache = new SaijCache();
const client = new SaijClient();
const DOCUMENT_EXTRACTOR_VERSION = 26;
const JURIS_SUMARIO_FACET =
  'Total|Tipo de Documento/Jurisprudencia/Sumario|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';
const JURIS_FALLO_FACET =
  'Total|Tipo de Documento/Jurisprudencia/Fallo|Fecha|Organismo|Tribunal|Tema|Publicación|Estado de Vigencia|Autor|Jurisdicción';
const LEGISLACION_FACET =
  'Total|Tipo de Documento/Legislación|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';
const LEGISLACION_DECRETO_FACET =
  'Total|Tipo de Documento/Legislación/Decreto|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';
const LEGISLACION_DNU_FACET =
  'Total|Tipo de Documento/Legislación/Decreto/Decreto de Necesidad y Urgencia|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';
const LEGISLACION_RESOLUCION_FACET =
  'Total|Tipo de Documento/Legislación/Resolución|Fecha|Organismo|Publicación|Tema|Estado de Vigencia|Autor|Jurisdicción';

const safeParseJson = (payload?: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const stripHtmlToText = (html?: string | null) => {
  if (!html || typeof html !== 'string') return null;
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const detectBlockReason = (htmlPreview?: string) => {
  if (!htmlPreview) return undefined;
  const lower = htmlPreview.toLowerCase();
  if (lower.includes('access denied') || lower.includes('forbidden') || lower.includes('not authorized')) {
    return 'blocked_html';
  }
  if (lower.includes('captcha')) return 'blocked_html';
  if (lower.includes('cookie') || lower.includes('consent')) return 'consent_page';
  if (lower.includes('window.location') || lower.includes('redirect')) return 'redirect_page';
  return undefined;
};

const resolveUnavailableReason = (error: any) => {
  const code = error?.code as string | undefined;
  const status = error?.statusCode ?? error?.status ?? error?.response?.status;
  if (code?.includes('timeout') || status === 504) return 'saij_timeout';
  if (code?.includes('blocked') || code?.includes('html_response')) return 'saij_blocked';
  if (status === 500) return 'saij_friendly_500';
  return 'saij_document_only_metadata';
};

const hasRenderableDocumentContent = (doc: any) =>
  !isDocumentContentEmpty({
    contentHtml: doc?.contentHtml,
    contentText: doc?.contentText,
    articles: Array.isArray(doc?.articles) ? doc.articles : [],
  });

const parseIsoDate = (value?: string | null): number => {
  if (!value || typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
};

const isCurrentExtractorVersion = (doc: any) =>
  (doc?.extractorVersion ?? 0) === DOCUMENT_EXTRACTOR_VERSION;

const buildDocumentFromMongo = (mongo: any, overrides?: { contentUnavailableReason?: string | null; fromCache?: boolean }) => {
  let contentHtml = typeof mongo?.contentHtml === 'string' ? mongo.contentHtml : null;
  let contentText = typeof mongo?.contentText === 'string' ? mongo.contentText : null;
  const headerText = typeof mongo?.headerText === 'string' ? mongo.headerText : null;
  let articles = Array.isArray(mongo?.articles) ? mongo.articles : [];
  const contentType = (mongo?.contentType as string | undefined) ?? 'legislacion';
  const hasArticles = Array.isArray(articles) && articles.length > 0;
  if (contentType === 'legislacion' && !hasArticles && contentText && !isLikelyLegalBodyText(contentText)) {
    contentText = null;
    articles = [];
  }
  if (contentType === 'legislacion' && !hasArticles && !contentText && contentHtml) {
    const htmlText = stripHtmlToText(contentHtml);
    if (htmlText && isLikelyLegalBodyText(htmlText)) {
      contentText = htmlText;
    } else {
      contentHtml = null;
      articles = [];
    }
  }
  const toc = Array.isArray(mongo?.toc) ? mongo.toc : [];
  const doc = {
    guid: mongo.guid,
    title: mongo.title,
    subtitle: typeof mongo.subtitle === 'string' ? mongo.subtitle : null,
    contentType: contentType as any,
    documentSubtype: typeof mongo?.documentSubtype === 'string' ? mongo.documentSubtype : null,
    estadoVigencia: typeof mongo?.estadoVigencia === 'string' ? mongo.estadoVigencia : null,
    tribunal: typeof mongo?.tribunal === 'string' ? mongo.tribunal : null,
    fechaSentencia: typeof mongo?.fechaSentencia === 'string' ? mongo.fechaSentencia : null,
    autor: typeof mongo?.autor === 'string' ? mongo.autor : null,
    organismo: typeof mongo?.organismo === 'string' ? mongo.organismo : null,
    extractorVersion: mongo.extractorVersion ?? 0,
    metadata: (mongo.metadata as any) ?? {},
    contentHtml,
    contentText,
    headerText,
    articles,
    toc,
    friendlyUrl: mongo.friendlyUrl ?? null,
    sourceUrl: mongo.sourceUrl ?? null,
    attachment: (mongo.attachment as any) ?? null,
    normasQueModifica: Array.isArray(mongo?.normasQueModifica) ? mongo.normasQueModifica : [],
    normasComplementarias: Array.isArray(mongo?.normasComplementarias) ? mongo.normasComplementarias : [],
    observaciones: Array.isArray(mongo?.observaciones) ? mongo.observaciones : [],
    relatedFallos: Array.isArray(mongo?.relatedFallos) ? mongo.relatedFallos : [],
    relatedContents: Array.isArray(mongo?.relatedContents) ? mongo.relatedContents : [],
    fetchedAt: mongo.fetchedAt?.toISOString?.() ?? new Date().toISOString(),
    fromCache: overrides?.fromCache ?? true,
  };
  const hasRenderableContent = !isDocumentContentEmpty(doc);
  const contentUnavailableReason =
    overrides?.contentUnavailableReason ?? (hasRenderableContent ? null : 'saij_document_only_metadata');
  return { ...doc, hasRenderableContent, contentUnavailableReason };
};

const extractRelatedSumarioCodes = (rawPayload: any): string[] => {
  const abstractObj = (rawPayload as any)?.data
    ? safeParseJson((rawPayload as any).data as string) ?? (rawPayload as any).data
    : rawPayload;
  const content = abstractObj?.document?.content ?? abstractObj?.content ?? {};
  const related =
    content?.['sumarios-relacionados'] ??
    content?.sumariosRelacionados ??
    content?.sumarios_relacionados ??
    null;
  if (!related) return [];

  const values: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      values.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(related);

  return Array.from(
    new Set(
      values
        .map((v) => String(v).trim())
        .filter((v) => /^[A-Za-z]\d{6,8}$/.test(v))
    )
  );
};

const getRawHits = (raw: any): any[] =>
  (raw as any)?.searchResults?.documentResultList ??
  raw?.documentResultList ??
  raw?.hits ??
  raw?.resultados ??
  raw?.results ??
  [];

const resolveRelatedSumarioFallback = async (
  rawPayload: any,
  options?: { maxCodes?: number }
): Promise<{ contentType: 'sumario'; contentText: string; subtitle: string | null } | null> => {
  const codes = extractRelatedSumarioCodes(rawPayload);
  if (!codes.length) return null;

  const snippets: string[] = [];
  let subtitle: string | null = null;
  const maxCodes = Math.max(1, options?.maxCodes ?? 3);

  for (const code of codes.slice(0, maxCodes)) {
    try {
      const { raw } = await client.search({
        r: `numero-sumario:${code}`,
        f: JURIS_SUMARIO_FACET,
        offset: 0,
        pageSize: 1,
      });
      const first = getRawHits(raw)[0];
      if (!first) continue;
      const mapped = mapSaijSearchHit(first, 'sumario');
      let text = typeof mapped.summary === 'string' ? mapped.summary.trim() : '';

      const relatedGuid = typeof mapped.guid === 'string' ? mapped.guid.trim() : '';
      if (relatedGuid) {
        try {
          const full = await client.fetchSaijDocumentByGuid(relatedGuid);
          const fullMapped = mapSaijDocument(full.raw, { guid: relatedGuid });
          const fullText = typeof fullMapped.contentText === 'string' ? fullMapped.contentText.trim() : '';
          if (fullText && fullText.length > text.length) {
            text = fullText;
          }
          if (!subtitle && fullMapped.subtitle) subtitle = fullMapped.subtitle;
        } catch (err) {
          logger.warn({ err, relatedGuid, code }, 'Related sumario full document fetch failed');
        }
      }

      if (text && !snippets.includes(text)) snippets.push(text);
      if (!subtitle && mapped.subtitle) subtitle = mapped.subtitle;
    } catch (err) {
      logger.warn({ err, code }, 'Related sumario resolution failed');
    }
  }

  if (!snippets.length) return null;
  return {
    contentType: 'sumario',
    contentText: snippets.join('\n\n'),
    subtitle,
  };
};

const stripSecondarySummarySections = (text?: string | null): string => {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const markers = [
    /\n\s*OTROS\s+SUMARIOS\b[\s\S]*$/i,
    /\n\s*CONTENIDO\s+RELACIONADO\b[\s\S]*$/i,
    /\n\s*FALLOS\s+A\s+LOS\s+QUE\s+APLICA\b[\s\S]*$/i,
    /\n\s*\[ir\s+arriba\][\s\S]*$/i,
  ];

  let cleaned = normalized;
  for (const marker of markers) {
    cleaned = cleaned.replace(marker, '').trim();
  }
  return cleaned;
};

const hasFalloSummaryBlock = (contentText?: string | null): boolean => {
  if (!contentText || typeof contentText !== 'string') return false;
  const normalized = contentText.replace(/\r\n/g, '\n');
  return /^SUMARIO\b/i.test(normalized) || /\n\s*SUMARIO\b/i.test(normalized);
};

const appendFalloSummary = (contentText: string | null | undefined, summaryText: string): string => {
  const base = typeof contentText === 'string' ? contentText.trim() : '';
  const cleanedSummary = stripSecondarySummarySections(summaryText)
    .replace(/^sumario\s*(de\s*fallo)?\s*:?\s*/i, '')
    .trim();
  if (!cleanedSummary) return base;
  if (hasFalloSummaryBlock(base)) return base;
  if (!base) return `SUMARIO\n${cleanedSummary}`;
  return `${base}\n\nSUMARIO\n${cleanedSummary}`;
};

const enrichFalloWithRelatedSummary = async (mapped: any, rawPayload: any) => {
  if (mapped?.contentType !== 'fallo') return mapped;
  if (hasFalloSummaryBlock(mapped?.contentText)) return mapped;

  const relatedSumario = await resolveRelatedSumarioFallback(rawPayload, { maxCodes: 1 });
  if (!relatedSumario?.contentText) return mapped;

  const mergedText = appendFalloSummary(mapped.contentText ?? null, relatedSumario.contentText);
  if (!mergedText) return mapped;

  return {
    ...mapped,
    contentText: mergedText,
    _contentSource: 'view-document.fallo+sumarios-relacionados',
  };
};

const normalizeSearchTerm = (value: string) => value.trim().replace(/\s+/g, '?');

const normalizeLooseText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const pickBestFalloMatch = (targetTitle: string, candidates: ReturnType<typeof mapSaijSearchHit>[]) => {
  const target = normalizeLooseText(targetTitle);
  if (!target) return candidates.find((c) => c.contentType === 'fallo') ?? null;
  let best: ReturnType<typeof mapSaijSearchHit> | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (candidate.contentType !== 'fallo') continue;
    const title = normalizeLooseText(candidate.title ?? '');
    if (!title) continue;
    let score = 0;
    if (title === target) score = 100;
    else if (title.includes(target)) score = 85;
    else if (target.includes(title)) score = 75;
    else {
      const targetTokens = target.split(' ').filter((t) => t.length > 2);
      const overlap = targetTokens.filter((token) => title.includes(token)).length;
      score = overlap;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best ?? candidates.find((c) => c.contentType === 'fallo') ?? null;
};

const resolveRelatedFallos = async (mappedDoc: any) => {
  const related = Array.isArray(mappedDoc?.relatedFallos) ? mappedDoc.relatedFallos : [];
  if (!related.length) return mappedDoc;

  const resolved = await Promise.all(
    related.map(async (item: any) => {
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      if (!title) return item;
      const directGuid = typeof item?.guid === 'string' ? item.guid.trim() : '';
      if (directGuid) {
        const sourceUrl =
          (typeof item?.sourceUrl === 'string' && item.sourceUrl.trim()) ||
          `https://www.saij.gob.ar/view-document?guid=${directGuid}`;
        return {
          ...item,
          guid: directGuid,
          sourceUrl,
          url: sourceUrl,
        };
      }
      try {
        const { raw } = await client.search({
          r: `titulo:${normalizeSearchTerm(title)}`,
          f: JURIS_FALLO_FACET,
          offset: 0,
          pageSize: 10,
        });
        const candidates = getRawHits(raw).map((hit: any) => mapSaijSearchHit(hit, 'fallo'));
        const best = pickBestFalloMatch(title, candidates);
        if (!best || !best.guid) return item;
        const sourceUrl = best.sourceUrl ?? best.friendlyUrl ?? `https://www.saij.gob.ar/view-document?guid=${best.guid}`;
        return {
          ...item,
          title: item.title || best.title,
          subtitle: item.subtitle || best.subtitle || null,
          guid: best.guid,
          sourceUrl,
          url: sourceUrl,
        };
      } catch (err) {
        logger.warn({ err, title }, 'Related fallo resolution failed');
        return item;
      }
    })
  );

  return { ...mappedDoc, relatedFallos: resolved };
};

type NormLookup = { kind: 'ley' | 'decreto' | 'dnu' | 'resolucion'; number: string; year?: string | null };

const buildNormLookupIdentityKey = (lookup: NormLookup) => {
  const base = `${lookup.kind}:${Number(lookup.number)}`;
  if (lookup.kind === 'ley') return base;
  return lookup.year ? `${base}:${lookup.year}` : base;
};

const parseNormLookup = (title?: string | null): NormLookup | null => {
  if (!title || typeof title !== 'string') return null;
  const clean = title.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!clean) return null;

  const leySlash = clean.match(/\bley\b[^\d]*(\d{2,7})\s*\/\s*(\d{2,4})\b/i);
  if (leySlash) return { kind: 'ley', number: leySlash[1], year: leySlash[2] };
  const ley = clean.match(/\bley\b[^\d]*(\d{2,7})\b/i);
  if (ley) return { kind: 'ley', number: ley[1] };

  const dnuSlash = clean.match(/\bdnu\b[^\d]*(\d{1,7})\s*\/\s*(\d{2,4})\b/i);
  if (dnuSlash) return { kind: 'dnu', number: dnuSlash[1], year: dnuSlash[2] };
  const dnu = clean.match(/\bdnu\b[^\d]*(\d{1,7})\b/i);
  if (dnu) return { kind: 'dnu', number: dnu[1] };

  const decretoSlash = clean.match(/\bdecreto\b[^\d]*(\d{1,7})\s*\/\s*(\d{2,4})\b/i);
  if (decretoSlash) {
    return {
      kind: clean.includes('necesidad y urgencia') ? 'dnu' : 'decreto',
      number: decretoSlash[1],
      year: decretoSlash[2],
    };
  }
  const decreto = clean.match(/\bdecreto\b[^\d]*(\d{1,7})\b/i);
  if (decreto) return { kind: clean.includes('necesidad y urgencia') ? 'dnu' : 'decreto', number: decreto[1] };
  const decretoShort = clean.match(/\bdec\b[^\d]*(\d{1,7})\s*(\d{4})?\b/i);
  if (decretoShort) return { kind: 'decreto', number: decretoShort[1], year: decretoShort[2] ?? null };

  const resolSlash = clean.match(/\bresoluci[oó]n\b[^\d]*(\d{1,7})\s*\/\s*(\d{2,4})\b/i);
  if (resolSlash) return { kind: 'resolucion', number: resolSlash[1], year: resolSlash[2] };
  const resol = clean.match(/\bresoluci[oó]n\b[^\d]*(\d{1,7})\b/i);
  if (resol) return { kind: 'resolucion', number: resol[1] };
  const resolShort = clean.match(/\bres\b[^\d]*(\d{1,7})\s*(\d{4})?\b/i);
  if (resolShort) return { kind: 'resolucion', number: resolShort[1], year: resolShort[2] ?? null };

  return null;
};

const formatNormLookupLabel = (lookup: NormLookup) => {
  const number = String(Number(lookup.number));
  const yearSuffix = lookup.year ? `/${lookup.year}` : '';
  if (lookup.kind === 'ley') return `Ley ${number}${yearSuffix}`;
  if (lookup.kind === 'dnu') return `DNU ${number}${yearSuffix}`;
  if (lookup.kind === 'resolucion') return `Resolución ${number}${yearSuffix}`;
  return `Decreto ${number}${yearSuffix}`;
};

const isGenericNormLabel = (title?: string | null): boolean => {
  if (!title || typeof title !== 'string') return false;
  const clean = title.replace(/\s+/g, ' ').trim();
  return /^(ley|decreto|dec|dnu|resoluci[oó]n|res)\b/i.test(clean) || /^\s*ley\s*n?[°º]?\s*\d+/i.test(clean);
};

const legislationFacetForLookupKind = (kind: 'ley' | 'decreto' | 'dnu' | 'resolucion') => {
  if (kind === 'dnu') return LEGISLACION_DNU_FACET;
  if (kind === 'decreto') return LEGISLACION_DECRETO_FACET;
  if (kind === 'resolucion') return LEGISLACION_RESOLUCION_FACET;
  return LEGISLACION_FACET;
};

const isLikelySaijGuid = (value?: string | null): boolean => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('_')) return false;
  return /^[0-9a-z]{6,}-[0-9a-z-]{8,}$/i.test(trimmed);
};

const pickBestLegislationMatch = (lookup: NormLookup, candidates: ReturnType<typeof mapSaijSearchHit>[]) => {
  const byNumber = candidates.filter((c) => c.contentType === 'legislacion');
  if (!byNumber.length) return null;

  let normalized = byNumber.map((c) => ({
    hit: c,
    text: `${(c.title || '').toLowerCase()} ${(c.subtitle || '').toLowerCase()}`,
  }));

  if (lookup.year) {
    const yearPattern = new RegExp(`(?:\\b|/)${lookup.year}\\b`);
    const yearMatched = normalized.filter((x) => yearPattern.test(x.text));
    if (yearMatched.length) normalized = yearMatched;
  }

  const byKind =
    lookup.kind === 'dnu'
      ? normalized.find((x) => x.text.includes('necesidad y urgencia') || x.text.includes(' dnu '))?.hit ??
        normalized.find((x) => x.text.includes('decreto'))?.hit
      : lookup.kind === 'decreto'
        ? normalized.find((x) => x.text.includes('decreto') && !x.text.includes('resoluci'))?.hit
        : lookup.kind === 'resolucion'
          ? normalized.find((x) => x.text.includes('resoluci'))?.hit
          : normalized.find((x) => x.text.includes('ley'))?.hit;
  return byKind ?? byNumber[0];
};

const isRawNormCodeLabel = (value?: string | null): boolean => {
  if (!value || typeof value !== 'string') return false;
  const clean = value.replace(/\s+/g, ' ').trim().toUpperCase();
  return /^(LEY|DNU|DEC(?:RETO)?|RES(?:OLUCION)?)\s+C?\s+\d{1,7}\b/.test(clean) && /\d{4}/.test(clean);
};

const parseNormLookupLoose = (value?: string | null): NormLookup | null => {
  if (!value || typeof value !== 'string') return null;
  const compact = value.replace(/[°º]/g, ' ').replace(/[./-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!compact) return null;

  const ley = compact.match(/\bley\b[^\d]*(\d{2,7})(?:\s*\/\s*(\d{2,4}))?\b/i);
  if (ley) return { kind: 'ley', number: ley[1], year: ley[2] ?? null };

  const dnu = compact.match(/\bdnu\b[^\d]*(\d{1,7})(?:\s*\/\s*(\d{2,4}))?\b/i);
  if (dnu) return { kind: 'dnu', number: dnu[1], year: dnu[2] ?? null };

  const decreto = compact.match(/\bdecreto\b[^\d]*(\d{1,7})(?:\s*\/\s*(\d{2,4}))?\b/i);
  if (decreto) {
    return {
      kind: compact.includes('necesidad y urgencia') ? 'dnu' : 'decreto',
      number: decreto[1],
      year: decreto[2] ?? null,
    };
  }

  const resol = compact.match(/\bresoluci[oó]n\b[^\d]*(\d{1,7})(?:\s*\/\s*(\d{2,4}))?\b/i);
  if (resol) return { kind: 'resolucion', number: resol[1], year: resol[2] ?? null };

  const rawCode = compact.match(/^(ley|dnu|dec|decreto|res|resolucion)\s+c?\s*0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (rawCode) {
    const kind =
      rawCode[1].startsWith('ley')
        ? 'ley'
        : rawCode[1].startsWith('dnu')
          ? 'dnu'
          : rawCode[1].startsWith('res')
            ? 'resolucion'
            : 'decreto';
    return { kind, number: rawCode[2], year: rawCode[3] ?? null };
  }

  return null;
};

const buildNormIdentityKey = (item: any): string | null => {
  if (!item || typeof item !== 'object') return null;
  const guid = typeof item.guid === 'string' ? item.guid.trim() : '';
  if (isLikelySaijGuid(guid)) return `guid:${guid}`;

  const fromTitle = parseNormLookupLoose(typeof item.title === 'string' ? item.title : null);
  if (fromTitle) return buildNormLookupIdentityKey(fromTitle);

  const fromSubtitle = parseNormLookupLoose(typeof item.subtitle === 'string' ? item.subtitle : null);
  if (fromSubtitle) return buildNormLookupIdentityKey(fromSubtitle);

  return null;
};

const scoreNormativeRef = (item: any): number => {
  if (!item || typeof item !== 'object') return 0;
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const subtitle = typeof item.subtitle === 'string' ? item.subtitle.trim() : '';
  const guid = typeof item.guid === 'string' ? item.guid.trim() : '';
  const sourceUrl = typeof item.sourceUrl === 'string' ? item.sourceUrl.trim() : '';
  const generic = isGenericNormLabel(title);
  const rawCode = isRawNormCodeLabel(title);

  let score = 0;
  if (isLikelySaijGuid(guid)) score += 100;
  if (!generic) score += 40;
  if (subtitle) score += 25;
  if (sourceUrl) score += 10;
  if (title.length >= 30) score += 5;
  if (rawCode) score -= 20;
  return score;
};

const mergeNormativeRefs = (current: any, incoming: any) => {
  const best = scoreNormativeRef(incoming) > scoreNormativeRef(current) ? { ...incoming } : { ...current };
  const alt = best === incoming ? current : incoming;

  if ((!best.subtitle || !String(best.subtitle).trim()) && alt?.subtitle) {
    best.subtitle = alt.subtitle;
  }
  if ((!best.guid || !String(best.guid).trim()) && isLikelySaijGuid(alt?.guid)) {
    best.guid = alt.guid;
  }
  if ((!best.sourceUrl || !String(best.sourceUrl).trim()) && alt?.sourceUrl) {
    best.sourceUrl = alt.sourceUrl;
  }
  if ((!best.url || !String(best.url).trim()) && alt?.url) {
    best.url = alt.url;
  }
  if ((!best.contentTypeHint || best.contentTypeHint === 'unknown') && alt?.contentTypeHint) {
    best.contentTypeHint = alt.contentTypeHint;
  }

  return best;
};

const compactNormativeRefs = (value: any) => {
  if (!Array.isArray(value) || !value.length) return Array.isArray(value) ? value : [];

  const keyed = new Map<string, any>();
  const order: string[] = [];
  const loose = new Map<string, any>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) continue;
    const key = buildNormIdentityKey(item);
    if (key) {
      if (!keyed.has(key)) {
        keyed.set(key, item);
        order.push(key);
      } else {
        keyed.set(key, mergeNormativeRefs(keyed.get(key), item));
      }
      continue;
    }

    const looseKey = `${title.toLowerCase().replace(/\s+/g, ' ').trim()}::${String(item.subtitle || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()}`;
    if (!loose.has(looseKey)) {
      loose.set(looseKey, item);
    } else {
      loose.set(looseKey, mergeNormativeRefs(loose.get(looseKey), item));
    }
  }

  const compacted = order.map((key) => keyed.get(key)).filter(Boolean);
  loose.forEach((item) => compacted.push(item));
  return compacted;
};

const enrichNormativeReferenceTitles = async (mappedDoc: any) => {
  const lookupCache = new Map<string, ReturnType<typeof mapSaijSearchHit> | null>();
  const maxUniqueLookups = 120;

  const resolveItem = async (item: any) => {
    if (!item || typeof item !== 'object') return item;
    const hasGuid = isLikelySaijGuid(typeof item.guid === 'string' ? item.guid : null);
    const title = typeof item.title === 'string' ? item.title : '';
    if (hasGuid || !isGenericNormLabel(title)) return item;

    const lookup = parseNormLookup(title);
    if (!lookup) return item;
    const key = `${lookup.kind}:${lookup.number}:${lookup.year ?? ''}`;

    if (!lookupCache.has(key)) {
      if (lookupCache.size >= maxUniqueLookups) {
        lookupCache.set(key, null);
      } else {
        try {
          const primaryFacet = legislationFacetForLookupKind(lookup.kind);
          const fetchCandidates = async (facet: string) => {
            const { raw } = await client.search({
              r: `numero-norma:${lookup.number}`,
              f: facet,
              offset: 0,
              pageSize: 10,
            });
            return getRawHits(raw).map((hit: any) => mapSaijSearchHit(hit, 'legislacion'));
          };

          let candidates = await fetchCandidates(primaryFacet);
          let picked = pickBestLegislationMatch(lookup, candidates);
          if (!picked && primaryFacet !== LEGISLACION_FACET) {
            candidates = await fetchCandidates(LEGISLACION_FACET);
            picked = pickBestLegislationMatch(lookup, candidates);
          }

          lookupCache.set(key, picked ?? null);
        } catch {
          lookupCache.set(key, null);
        }
      }
    }

    const resolved = lookupCache.get(key);
    if (!resolved) {
      return {
        ...item,
        title: formatNormLookupLabel(lookup),
      };
    }
    const sourceUrl = resolved.sourceUrl ?? resolved.friendlyUrl ?? (item.sourceUrl || item.url || null);
    return {
      ...item,
      title: resolved.title || item.title,
      subtitle: resolved.subtitle || item.subtitle || null,
      guid: resolved.guid || item.guid || null,
      sourceUrl,
      url: sourceUrl || item.url,
    };
  };

  const resolveArray = async (value: any) => {
    if (!Array.isArray(value) || !value.length) return Array.isArray(value) ? value : [];
    const compacted = compactNormativeRefs(value);
    const resolved = await Promise.all(compacted.map((item) => resolveItem(item)));
    return compactNormativeRefs(resolved);
  };

  const out = { ...mappedDoc };
  out.normasQueModifica = compactNormativeRefs(await resolveArray(out.normasQueModifica));
  out.normasComplementarias = compactNormativeRefs(await resolveArray(out.normasComplementarias));
  out.observaciones = compactNormativeRefs(await resolveArray(out.observaciones));
  out.relatedContents = compactNormativeRefs(await resolveArray(out.relatedContents));
  if (Array.isArray(out.articles) && out.articles.length) {
    out.articles = await Promise.all(
      out.articles.map(async (article: any) => ({
        ...article,
        normasQueModifica: compactNormativeRefs(await resolveArray(article?.normasQueModifica)),
        normasComplementarias: compactNormativeRefs(await resolveArray(article?.normasComplementarias)),
        observaciones: compactNormativeRefs(await resolveArray(article?.observaciones)),
        relatedContents: compactNormativeRefs(await resolveArray(article?.relatedContents)),
      }))
    );
  }
  return out;
};
const warnUnimplementedFilters = (filters: SaijSearchRequest['filters']) => {
  const unimplemented: Array<keyof typeof filters> = [
    // Estado/tema/organismo tienen versión facet implementada
    'titulo',
    'fechaDesde',
    'fechaHasta',
    'idDoc',
  ];
  const provided = unimplemented.filter((f) => filters[f]);
  if (provided.length) {
    logger.warn({ filters: provided }, 'Filtros aÃºn no implementados, se ignoran en query');
  }
};

export const SaijService = {
  async search(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    warnUnimplementedFilters(input.filters);

    const query = buildSaijQuery(input);
    const cacheKey = `saij-search:v5:${hashString(JSON.stringify(query))}`;

    if (!input.debug) {
      const cachedMem = cache.getSearch(query);
      if (cachedMem) {
        return { ...cachedMem, query };
      }

      const cachedDb = await CacheService.getSearch(cacheKey);
      if (cachedDb) {
        const response = cachedDb as SaijSearchResponse;
        cache.setSearch(query, response);
        return { ...response, query };
      }
    }

    logger.info({ query }, 'Executing SAIJ search');
    const { raw, debug } = await client.search(query);

    logger.info(
      {
        queryObjectData: (raw as any)?.queryObjectData,
        totalSearchResults: (raw as any)?.searchResults?.totalSearchResults,
        hasDocumentResultList: Boolean((raw as any)?.searchResults?.documentResultList),
        documentResultListLength: (raw as any)?.searchResults?.documentResultList?.length ?? null,
        categoriesResultListLength: (raw as any)?.searchResults?.categoriesResultList?.length ?? null,
      },
      'SAIJ raw search debug'
    );

    const rawHits =
      (raw as any)?.searchResults?.documentResultList ??
      raw.documentResultList ??
      raw.hits ??
      raw.resultados ??
      raw.results ??
      [];

    const mappedHits = rawHits.map((item: any) => mapSaijSearchHit(item, input.contentType));
    const hits =
      input.contentType === 'sumario' || input.contentType === 'doctrina' || input.contentType === 'dictamen'
        ? [...mappedHits].sort((a, b) => parseIsoDate(b.fecha ?? null) - parseIsoDate(a.fecha ?? null))
        : mappedHits;
    const response: SaijSearchResponse = {
      ok: true,
      query,
      total:
        (raw as any)?.searchResults?.totalSearchResults ??
        raw.total ??
        hits.length,
      hits,
      facets:
        (raw as any)?.searchResults?.categoriesResultList ??
        (raw as any)?.searchResults?.searchResults ??
        raw.facets ??
        raw.facetas ??
        [],
    };

    if (input.debug) {
      response.debugInfo = {
        url: debug.url,
        status: debug.status,
        contentType: debug.contentType,
        rawTotalSearchResults:
          (raw as any)?.searchResults?.totalSearchResults ?? raw.total ?? null,
        rawDocumentResultListLength:
          (raw as any)?.searchResults?.documentResultList?.length ??
          raw.documentResultList?.length ??
          null,
      };
    } else {
      cache.setSearch(query, response);
      void CacheService.saveSearch(cacheKey, input, response, Math.floor(SEARCH_CACHE_TTL_MS / 1000)).catch((err) => {
        logger.warn({ err }, 'Failed to persist search cache');
      });
    }
    return response;
  },

  async getDocumentByGuid(guid: string, opts?: { debug?: boolean }): Promise<SaijDocumentResponse> {
    if (!guid || guid.trim().length === 0) {
      throw new HttpError(400, 'invalid_guid', 'guid requerido');
    }

    const debug = opts?.debug ?? false;

    if (!debug) {
      const mem = cache.getDocument(guid);
      if (mem) {
        const payload = { ...(mem.payload as any), fromCache: true } as any;
        if (isCurrentExtractorVersion(payload) && hasRenderableDocumentContent(payload)) {
          return {
            ok: true,
            document: payload,
            debugInfo: { strategyUsed: 'cache' },
          };
        }
        logger.info({ guid }, 'Ignoring outdated/empty memory cache and refetching from SAIJ');
      }

      const mongo = await NormService.getCached(guid);
      if (mongo && mongo.expiresAt > new Date()) {
        const doc = buildDocumentFromMongo(mongo, { fromCache: true });
        if (isCurrentExtractorVersion(doc) && doc.hasRenderableContent) {
          cache.setDocument({ guid, payload: doc, fetchedAt: doc.fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
          return { ok: true, document: doc, debugInfo: { strategyUsed: 'cache' } };
        }
        logger.info({ guid }, 'Ignoring outdated/empty mongo cache and refetching from SAIJ');
      }
    }

    let strategyUsed: 'view-document' | 'friendly-url-fallback' | 'view-document+friendly-url-fallback' = 'view-document';
    let hadEmptyPrimaryContent = false;
    let fallbackAttempted = false;
    let fallbackSucceeded = false;
    let externalContentType: string | undefined;
    let externalUrl: string | undefined;

    try {
      const { raw, debug: debugInfo } = await client.fetchSaijDocumentByGuid(guid);
      externalContentType = debugInfo.contentType;
      externalUrl = debugInfo.url;
      let mapped = mapSaijDocument(raw, { guid });
      mapped = await resolveRelatedFallos(mapped);
      mapped = await enrichNormativeReferenceTitles(mapped);
      mapped = await enrichFalloWithRelatedSummary(mapped, raw);
      if (isDocumentContentEmpty(mapped)) {
        const relatedSumario = await resolveRelatedSumarioFallback(raw);
        if (relatedSumario) {
          mapped = {
            ...mapped,
            contentType: mapped.contentType === 'legislacion' ? relatedSumario.contentType : mapped.contentType,
            subtitle: mapped.subtitle || relatedSumario.subtitle || null,
            contentHtml: null,
            contentText: relatedSumario.contentText,
            articles: [],
            _contentSource: 'view-document.sumarios-relacionados',
          };
        }
      }
      const primaryRenderable = !isDocumentContentEmpty(mapped);

      if (primaryRenderable) {
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent: false,
          fallbackAttempted: false,
          fallbackSucceeded: false,
          viewDocumentHadRenderableContent: true,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: true,
        });
      }

      if (isDocumentContentEmpty(mapped) && (mapped.friendlyUrl || mapped.sourceUrl)) {
        hadEmptyPrimaryContent = true;
        fallbackAttempted = true;
        try {
          const fallbackUrl = mapped.friendlyUrl || mapped.sourceUrl!;
          const { html, debug: dbg } = await client.fetchFriendlyUrl(fallbackUrl);
          externalContentType = dbg.contentType;
          externalUrl = dbg.finalUrl ?? dbg.url;
          const fallbackDoc = mapSaijDocument({}, { guid, fallbackHtml: html, friendlyUrl: fallbackUrl });
          mapped = mergeDocumentContent(mapped, fallbackDoc);
          mapped = await resolveRelatedFallos(mapped);
          mapped = await enrichNormativeReferenceTitles(mapped);
          mapped = await enrichFalloWithRelatedSummary(mapped, raw);
          fallbackSucceeded = !isDocumentContentEmpty(mapped);
          strategyUsed = 'view-document+friendly-url-fallback';
          const fallbackReason: string | undefined =
            fallbackSucceeded ? undefined : detectBlockReason(dbg.htmlPreview) ?? 'html_without_extractable_main_content';
          if (fallbackReason) {
            logger.warn({ guid, fallbackReason }, 'Fallback HTML sin contenido Ãºtil');
          }
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent,
          fallbackAttempted,
          fallbackSucceeded,
          fallbackHttpStatus: dbg.status,
          fallbackContentType: dbg.contentType,
          fallbackFinalUrl: dbg.finalUrl ?? dbg.url,
          fallbackHtmlPreview: dbg.htmlPreview,
          fallbackReason,
          fallbackErrorName: undefined,
          fallbackErrorMessage: undefined,
          primaryHasMetadataOnly: true,
          contentUnavailableReason: fallbackSucceeded
            ? null
            : fallbackReason === 'fallback_fetch_failed' && dbg.status === 500
              ? 'saij_friendly_500'
                : fallbackReason ?? null,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      } catch (err) {
          logger.warn({ guid, err }, 'Fallback after empty content failed');
          const errStatus = (err as any)?.response?.status || (err as any)?.status;
          const reason =
          errStatus === 500
            ? 'saij_friendly_500'
            : errStatus === 504
              ? 'saij_timeout'
              : 'fallback_fetch_failed';
        return await finalizeDocument(guid, mapped, raw, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent,
          fallbackAttempted,
            fallbackSucceeded: false,
            fallbackReason: reason,
            fallbackErrorName: (err as any)?.name,
            fallbackErrorMessage: (err as any)?.message,
            primaryHasMetadataOnly: true,
            contentUnavailableReason: reason,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: (mapped as any)?._contentSource ?? null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      }
      }

      return await finalizeDocument(guid, mapped, raw, {
        debug,
        strategyUsed,
        externalContentType,
        externalUrl,
        hadEmptyPrimaryContent,
        fallbackAttempted,
        fallbackSucceeded,
      });
    } catch (error) {
      logger.warn({ guid, error }, 'view-document failed, trying friendly-url');
      strategyUsed = 'friendly-url-fallback';
      const fallbackReasonFromError = resolveUnavailableReason(error);

      // try fallback using friendly URL from cache (mongo)
      const mongo = await NormService.getCached(guid);
      const friendlyUrl = (mongo as any)?.friendlyUrl;
      if (!friendlyUrl) {
        if (mongo) {
          const doc = buildDocumentFromMongo(mongo, { fromCache: true, contentUnavailableReason: fallbackReasonFromError });
          return {
            ok: true,
            document: doc,
            debugInfo: debug
              ? {
                  strategyUsed: 'cache',
                  hadEmptyPrimaryContent: true,
                  contentUnavailableReason: doc.contentUnavailableReason,
                }
              : undefined,
          };
        }
        throw new HttpError(502, 'saij_document_unavailable', 'No se pudo resolver el documento desde SAIJ');
      }

      try {
        const { html, debug: dbg } = await client.fetchFriendlyUrl(friendlyUrl);
        externalContentType = dbg.contentType;
        externalUrl = dbg.finalUrl ?? dbg.url;
        let mapped = mapSaijDocument({}, { guid, fallbackHtml: html, friendlyUrl });
        mapped = await resolveRelatedFallos(mapped);
        mapped = await enrichNormativeReferenceTitles(mapped);
        mapped = await enrichFalloWithRelatedSummary(mapped, null);
        const mergedDoc = mapped;
        const fbSucceeded = !isDocumentContentEmpty(mergedDoc);
        const fbReason: string | undefined = fbSucceeded
          ? undefined
          : detectBlockReason(dbg.htmlPreview) ?? 'html_without_extractable_main_content';
        return await finalizeDocument(guid, mergedDoc, {}, {
          debug,
          strategyUsed,
          externalContentType,
          externalUrl,
          hadEmptyPrimaryContent: true,
          fallbackAttempted: true,
          fallbackSucceeded: fbSucceeded,
          fallbackHttpStatus: dbg.status,
          fallbackContentType: dbg.contentType,
          fallbackFinalUrl: dbg.finalUrl ?? dbg.url,
          fallbackHtmlPreview: dbg.htmlPreview,
          fallbackReason: fbReason,
          fallbackErrorName: undefined,
          fallbackErrorMessage: undefined,
          primaryHasMetadataOnly: false,
          contentUnavailableReason:
            fbSucceeded || !fbReason
              ? null
              : fbReason === 'fallback_fetch_failed' && dbg.status === 500
                ? 'saij_friendly_500'
                : fbReason,
          viewDocumentHadRenderableContent: false,
          viewDocumentContentSource: null,
          friendlyFallbackSkippedBecausePrimaryWasEnough: false,
        });
      } catch (fallbackError) {
        logger.error({ guid, fallbackError }, 'friendly-url fallback failed');
        if (mongo) {
          const doc = buildDocumentFromMongo(mongo, {
            fromCache: true,
            contentUnavailableReason: resolveUnavailableReason(fallbackError),
          });
          return {
            ok: true,
            document: doc,
            debugInfo: debug
              ? {
                  strategyUsed: 'cache',
                  hadEmptyPrimaryContent: true,
                  contentUnavailableReason: doc.contentUnavailableReason,
                }
              : undefined,
          };
        }
        throw new HttpError(502, 'saij_document_unavailable', 'No se pudo resolver el documento desde SAIJ');
      }
    }
  },

  async debugFriendlyUrl(guid: string) {
    if (!guid || guid.trim().length === 0) {
      throw new HttpError(400, 'invalid_guid', 'guid requerido');
    }

    const { raw } = await client.fetchSaijDocumentByGuid(guid);
    const abstractObj = (raw as any)?.data
      ? safeParseJson((raw as any).data as string) ?? (raw as any).data
      : raw;
    const metadata = abstractObj?.document?.metadata ?? abstractObj?.metadata ?? {};
    const friendlyMeta = metadata['friendly-url'] ?? metadata['friendly_url'];
    const subdomain = friendlyMeta?.subdomain as string | undefined;
    const description = friendlyMeta?.description as string | undefined;

    const candidates: string[] = [];
    if (subdomain && description) candidates.push(`https://www.saij.gob.ar/${subdomain}-${description}`);
    if (description) candidates.push(`https://www.saij.gob.ar/${description}`);
    if (friendlyMeta && typeof friendlyMeta === 'string') candidates.push(`https://www.saij.gob.ar/${friendlyMeta}`);

    const attempts: any[] = [];
    let success = false;
    for (const url of candidates) {
      try {
        const { html, debug } = await client.fetchFriendlyUrl(url);
        attempts.push({ url, status: debug.status, finalUrl: debug.finalUrl, contentType: debug.contentType, preview: debug.htmlPreview, success: true });
        success = true;
        return {
          ok: true,
          guid,
          constructedFriendlyUrl: url,
          friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
          attempts,
          bodyPreview: debug.htmlPreview,
        };
      } catch (err: any) {
        attempts.push({
          url,
          success: false,
          errorName: err?.name,
          errorMessage: err?.message,
          status: err?.response?.status ?? err?.status,
          finalUrl: err?.response?.request?.res?.responseUrl,
        });
      }
    }

    return {
      ok: true,
      guid,
      constructedFriendlyUrl: candidates[0] ?? null,
      friendlyUrlParts: { raw: friendlyMeta, subdomain, description },
      attempts,
      success,
    };
  },
};

async function finalizeDocument(
  guid: string,
  mapped: any,
  rawPayload: any,
  debugParams: {
    debug: boolean;
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
    contentUnavailableReason?: string | null;
    primaryHasMetadataOnly?: boolean;
    viewDocumentHadRenderableContent?: boolean;
    viewDocumentContentSource?: string | null;
    friendlyFallbackSkippedBecausePrimaryWasEnough?: boolean;
  }
): Promise<SaijDocumentResponse> {
  const expiresAt = new Date(Date.now() + DOCUMENT_CACHE_TTL_MS);
  const fetchedAt = new Date().toISOString();
  let contentUnavailableReason = debugParams.contentUnavailableReason ?? null;
  const hasRenderableContent = !isDocumentContentEmpty(mapped);
  const primaryTextWasRejectedAsMetadataOnly = Boolean((mapped as any)?._primaryTextWasRejectedAsMetadataOnly);
  const rejectedTextReason = (mapped as any)?._rejectedTextReason ?? null;
  if (!hasRenderableContent) {
    if (primaryTextWasRejectedAsMetadataOnly) {
      contentUnavailableReason = 'saij_metadata_only';
    } else if (!contentUnavailableReason) {
      contentUnavailableReason = 'saij_document_only_metadata';
    }
  }
  const safeSubtitle = typeof mapped.subtitle === 'string' ? mapped.subtitle : null;
  const rawViewDocumentContentSource = debugParams.viewDocumentContentSource ?? (mapped as any)?._contentSource ?? null;
  const viewDocumentContentSource =
    rawViewDocumentContentSource === 'view-document.articulo[]' ? 'articulo[]' : rawViewDocumentContentSource;
  const structuredArticleSourceUsed = Boolean((mapped as any)?._structuredArticleSourceUsed);
  const structuredArticlePath = (mapped as any)?._structuredArticlePath ?? null;
  const structuredArticleCount = (mapped as any)?._structuredArticleCount ?? 0;
  const docWithMeta = {
    ...mapped,
    subtitle: safeSubtitle,
    extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
    fetchedAt,
    fromCache: false,
    hasRenderableContent,
    contentUnavailableReason,
  };

  if (!debugParams.debug) {
    cache.setDocument({ guid, payload: docWithMeta, fetchedAt }, DOCUMENT_CACHE_TTL_MS / 1000);
    const persistentDoc = {
      guid,
      source: 'saij' as const,
      extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
      contentType: mapped.contentType,
      documentSubtype: typeof (mapped as any).documentSubtype === 'string' ? (mapped as any).documentSubtype : null,
      estadoVigencia: typeof (mapped as any).estadoVigencia === 'string' ? (mapped as any).estadoVigencia : null,
      tribunal: typeof (mapped as any).tribunal === 'string' ? (mapped as any).tribunal : null,
      fechaSentencia: typeof (mapped as any).fechaSentencia === 'string' ? (mapped as any).fechaSentencia : null,
      autor: typeof (mapped as any).autor === 'string' ? (mapped as any).autor : null,
      organismo: typeof (mapped as any).organismo === 'string' ? (mapped as any).organismo : null,
      title: mapped.title,
      subtitle: safeSubtitle,
      metadata: mapped.metadata,
      contentHtml: mapped.contentHtml ?? null,
      contentText: mapped.contentText ?? null,
      headerText: (mapped as any).headerText ?? null,
      articles: mapped.articles,
      toc: mapped.toc,
      sourceUrl: mapped.sourceUrl ?? null,
      attachment: (mapped as any).attachment ?? null,
      normasQueModifica: Array.isArray((mapped as any).normasQueModifica) ? (mapped as any).normasQueModifica : [],
      normasComplementarias: Array.isArray((mapped as any).normasComplementarias) ? (mapped as any).normasComplementarias : [],
      observaciones: Array.isArray((mapped as any).observaciones) ? (mapped as any).observaciones : [],
      relatedFallos: Array.isArray((mapped as any).relatedFallos) ? (mapped as any).relatedFallos : [],
      relatedContents: Array.isArray((mapped as any).relatedContents) ? (mapped as any).relatedContents : [],
      friendlyUrl: mapped.friendlyUrl ?? null,
      rawPayload,
      fetchedAt: new Date(fetchedAt),
      expiresAt,
    };
    void NormService.save(persistentDoc).catch((err) => {
      logger.warn({ guid, err }, 'Failed to persist document cache');
    });
  }

  return {
    ok: true,
    document: docWithMeta,
    debugInfo: debugParams.debug
      ? {
          strategyUsed: debugParams.strategyUsed,
          externalContentType: debugParams.externalContentType,
          externalUrl: debugParams.externalUrl,
          hadEmptyPrimaryContent: debugParams.hadEmptyPrimaryContent ?? false,
          fallbackAttempted: debugParams.fallbackAttempted ?? false,
          fallbackSucceeded: debugParams.fallbackSucceeded ?? false,
          fallbackHttpStatus: debugParams.fallbackHttpStatus,
          fallbackContentType: debugParams.fallbackContentType,
          fallbackFinalUrl: debugParams.fallbackFinalUrl,
          fallbackHtmlPreview: debugParams.fallbackHtmlPreview,
          fallbackReason: debugParams.fallbackReason,
          fallbackErrorName: debugParams.fallbackErrorName,
          fallbackErrorMessage: debugParams.fallbackErrorMessage,
          primaryHasMetadataOnly: debugParams.primaryHasMetadataOnly ?? false,
          primaryTextWasRejectedAsMetadataOnly,
          rejectedTextReason,
          hasRenderableContent,
          contentUnavailableReason,
          viewDocumentHadRenderableContent: debugParams.viewDocumentHadRenderableContent ?? false,
          viewDocumentContentSource,
          articleCount: Array.isArray(mapped.articles) ? mapped.articles.length : 0,
          structuredArticleSourceUsed,
          structuredArticlePath,
          structuredArticleCount,
          friendlyFallbackSkippedBecausePrimaryWasEnough:
            debugParams.friendlyFallbackSkippedBecausePrimaryWasEnough ?? false,
        }
      : undefined,
  };
}



