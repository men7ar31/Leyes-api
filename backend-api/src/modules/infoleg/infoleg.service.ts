import { load } from 'cheerio';
import { env } from '../../config/env';
import { HttpError } from '../../utils/httpError';
import {
  SaijDocumentResponse,
  SaijLinkedDocumentRef,
  SaijResolvedDocument,
  SaijSearchHit,
  SaijSearchRequest,
  SaijSearchResponse,
} from '../saij/saij.types';

const INFOLEG_DEFAULT_PAGE_SIZE = 20;
const INFOLEG_MAX_FETCH_PAGES = 30;
const INFOLEG_NUMBER_FALLBACK_MAX_PAGES = 2;
const INFOLEG_SEARCH_CACHE_TTL_MS = 1000 * 60 * 5;
const INFOLEG_BASE_WEB = 'https://servicios.infoleg.gob.ar';

type SearchCriteria = {
  tipoNorma?: string;
  numero?: string;
  anioSancion?: string;
  texto?: string;
  preferredTitleToken?: string;
};

type ParsedSearchPage = {
  total: number;
  totalPages: number;
  hits: SaijSearchHit[];
};

type CachedSearchEntry = {
  expiresAt: number;
  payload: SaijSearchResponse;
};

const collapseWhitespace = (value?: string | null) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLoose = (value?: string | null) =>
  collapseWhitespace(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const collapseMultiline = (value?: string | null) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const sanitizeSearchSubtitle = (value?: string | null) =>
  collapseWhitespace(value)
    .replace(/\bVer\s+Norma(?:\s+y\s+Textos?\s+Resaltados?)?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const sanitizeSearchTitle = (value?: string | null) =>
  collapseWhitespace(value)
    .replace(/^Ver\s+Norma(?:\s+y\s+Textos?\s+Resaltados?)?\s*/i, '')
    .trim();

const parseFirstNumber = (value?: string | null) => {
  const match = String(value || '').match(/(\d[\d.]*)/);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, '')) || 0;
};

const normalizeTipoNorma = (value?: string | null) => {
  const normalized = normalizeLoose(value);
  if (!normalized) return '';
  if (normalized.includes('ley')) return '1';
  if (normalized.includes('decreto') || normalized === 'dnu' || normalized.includes('texto_ordenado_decreto')) return '2';
  if (normalized.includes('decision') && normalized.includes('administrativa')) return '8';
  if (normalized.includes('resolucion') || normalized.includes('resoluciÃ³n')) return '3';
  if (normalized.includes('disposicion') || normalized.includes('disposiciÃ³n')) return '4';
  if (normalized.includes('acordada')) return '12';
  if (normalized.includes('circular')) return '5';
  if (normalized.includes('comunicacion') || normalized.includes('comunicaciÃ³n')) return '6';
  if (normalized.includes('comunicado')) return '13';
  if (normalized.includes('convenio')) return '20';
  if (normalized.includes('decreto/ley') || normalized.includes('decreto ley')) return '7';
  if (normalized.includes('ordenanza')) return '29';
  return '';
};

const normalizeNormNumber = (value?: string | null) =>
  collapseWhitespace(value)
    .replace(/[^\d/]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');

const normalizeYear = (value?: string | null) => {
  const match = collapseWhitespace(value).match(/\b(\d{4})\b/);
  return match ? match[1] : '';
};

const extractFacetLeaf = (value?: string | null) => {
  const clean = collapseWhitespace(value);
  if (!clean) return '';
  const parts = clean.split('/').map((part) => collapseWhitespace(part)).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
};

const resolveTipoNormaAndHints = (value?: string | null) => {
  const normalizedRaw = normalizeLoose(value);
  const mappedTipo = normalizeTipoNorma(value);
  const hints: string[] = [];

  const aliasHints: Record<string, { tipoNorma?: string; hints?: string[]; preferredTitleToken?: string }> = {
    codigo: { hints: ['codigo'], preferredTitleToken: 'codigo' },
    codigo_nacional: { hints: ['codigo nacional'], preferredTitleToken: 'codigo' },
    codigo_provincial: { hints: ['codigo provincial'], preferredTitleToken: 'codigo' },
    constitucion: { hints: ['constitucion'], preferredTitleToken: 'constitucion' },
    constitucion_nacional: { hints: ['constitucion nacional'], preferredTitleToken: 'constitucion' },
    constitucion_provincial: { hints: ['constitucion provincial'], preferredTitleToken: 'constitucion' },
    leyes_nacionales_vigentes: { tipoNorma: '1', hints: ['ley'] },
    leyes_provinciales_vigentes: { tipoNorma: '1', hints: ['ley provincial'] },
    nuevas_leyes_sancionadas: { tipoNorma: '1', hints: ['ley'] },
    leyes_vetadas: { tipoNorma: '1', hints: ['ley vetada'] },
    leyes_ratificatorias_tratados: { tipoNorma: '1', hints: ['tratado'] },
    normas_internacionales: { hints: ['internacional tratado convenio'] },
    normativa_comunitaria: { hints: ['normativa comunitaria'] },
    decretos_nacionales_vigentes: { tipoNorma: '2', hints: ['decreto'] },
    decreto: { tipoNorma: '2', hints: ['decreto'] },
    decreto_simple: { tipoNorma: '2', hints: ['decreto'] },
    texto_ordenado_decreto: { tipoNorma: '2', hints: ['texto ordenado decreto'] },
    dnu: { tipoNorma: '2', hints: ['dnu decreto necesidad urgencia'] },
    resolucion_afip: { tipoNorma: '3', hints: ['resolucion afip'] },
    resolucion_igj: { tipoNorma: '3', hints: ['resolucion igj'] },
    resolucion_aabe: { tipoNorma: '3', hints: ['resolucion aabe'] },
    fallo: { hints: ['fallo sentencia'] },
    sumario: { hints: ['sumario'] },
    dictamen: { hints: ['dictamen'] },
    doctrina: { hints: ['doctrina'] },
  };

  const alias = aliasHints[normalizedRaw];
  if (alias) {
    if (alias.tipoNorma) {
      return {
        tipoNorma: alias.tipoNorma,
        hints: alias.hints ?? [],
        preferredTitleToken: alias.preferredTitleToken,
      };
    }
    hints.push(...(alias.hints ?? []));
    return {
      tipoNorma: mappedTipo || undefined,
      hints,
      preferredTitleToken: alias.preferredTitleToken,
    };
  }

  return {
    tipoNorma: mappedTipo || undefined,
    hints,
    preferredTitleToken: undefined,
  };
};

const decodeResponseBody = (raw: Buffer, contentType?: string) => {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('utf-8') || ct.includes('utf8')) {
    return raw.toString('utf8');
  }

  const latin = raw.toString('latin1');
  if (/charset\s*=\s*utf-8/i.test(latin.slice(0, 1200))) {
    return raw.toString('utf8');
  }
  return latin;
};

const parseInfolegId = (rawGuid: string) => {
  const source = collapseWhitespace(rawGuid);
  const direct = source.match(/^infoleg:(\d+)$/i);
  if (direct) return direct[1];
  const numeric = source.match(/^(\d+)$/);
  if (numeric) return numeric[1];
  const fromUrl = source.match(/[?&]id=(\d+)/i);
  if (fromUrl) return fromUrl[1];
  return null;
};

const parseInfolegProvUrl = (rawGuid: string) => {
  const source = collapseWhitespace(rawGuid);
  const direct = source.match(/^infoleg-prov:([A-Za-z0-9_-]+)$/i);
  if (!direct || !direct[1]) return null;
  try {
    const decoded = Buffer.from(direct[1], 'base64url').toString('utf8');
    const absolute = toAbsoluteInfolegUrl(decoded);
    return absolute || decoded;
  } catch {
    return null;
  }
};

const toAbsoluteInfolegUrl = (url?: string | null) => {
  const clean = collapseWhitespace(url);
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  try {
    return new URL(clean, `${env.infolegBaseUrl}/`).toString();
  } catch {
    if (clean.startsWith('/')) return `${INFOLEG_BASE_WEB}${clean}`;
    return `${INFOLEG_BASE_WEB}/${clean}`;
  }
};

const extractTextWithBreaks = (html: string) => {
  const $ = load(html);
  $('script,style,noscript').remove();
  $('br').replaceWith('\n');
  $('p,div,li,tr,table,h1,h2,h3,h4,h5,h6').each((_, node) => {
    $(node).append('\n');
  });
  return collapseMultiline($.root().text());
};

const ARTICLE_TITLE_VERB_PATTERN =
  /\b(es|son|sera|seran|debe|deben|puede|pueden|tiene|tienen|queda|quedan|dispone|disponen|establece|establecen|modifica|modifican|aprueba|aprueban|apruebase|apru[eé]base|rige|rigen|aplica|aplican|corresponde|corresponden|sustituye|sustituyese|deroga|derogase|incorpora|incorporase|agrega|agregase|reemplaza|reemplazase|modificase|prorrogase|promulgase|observase|habra|habran|existe|existen)\b/i;

const SECTION_LEVEL_ORDER = ['parte', 'libro', 'titulo', 'capitulo', 'seccion', 'anexo'] as const;
type SectionLevel = (typeof SECTION_LEVEL_ORDER)[number];
const HEADING_SHORT_DESCRIPTOR_PATTERN = /^(?:[IVXLCDM]{1,8}|[0-9]{1,4}|[A-Z])$/i;

const isShortHeadingDescriptor = (line: string) => HEADING_SHORT_DESCRIPTOR_PATTERN.test(collapseWhitespace(line));

const normalizeArticleNumberToken = (value?: string | null) =>
  collapseWhitespace(value)
    .replace(/[\u00BA\u00B0]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const extractArticleBaseNumber = (value?: string | null) => {
  const token = normalizeArticleNumberToken(value);
  const match = token.match(/^(\d{1,5})\b/);
  if (!match) return null;
  const base = Number(match[1]);
  return Number.isFinite(base) && base > 0 ? base : null;
};

const hasLexicalArticleStructure = (value?: string | null) => {
  const normalized = normalizeLoose(value);
  if (!normalized) return false;
  return normalized.includes('codigo') && normalized.includes('civil') && normalized.includes('comercial');
};

const getSectionHeadingLevel = (line: string): { level: SectionLevel; heading: string } | null => {
  const clean = collapseWhitespace(line);
  if (!clean) return null;
  if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(clean)) return null;
  if (clean.length > 120) return null;
  if (/[()“”"']/u.test(clean)) return null;
  if (/,/.test(clean)) return null;
  const words = clean.split(' ').filter(Boolean);
  if (words.length > 12) return null;
  if (ARTICLE_TITLE_VERB_PATTERN.test(clean)) return null;
  const normalized = normalizeLoose(clean);
  if (/^(anexo|titulo|capitulo|seccion|libro|parte)$/.test(normalized)) return null;
  if (normalized.includes('codigo civil y comercial')) return null;

  const matchesHeadingLead = (
    token: string,
    value: string,
    options?: { allowPreliminar?: boolean; allowUnico?: boolean; allowOrdinals?: boolean }
  ) => {
    const allowPreliminar = options?.allowPreliminar ?? false;
    const allowUnico = options?.allowUnico ?? false;
    const allowOrdinals = options?.allowOrdinals ?? false;
    const preliminar = allowPreliminar ? '|preliminar' : '';
    const unico = allowUnico ? '|unico|único' : '';
    const ordinals = allowOrdinals ? '|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta' : '';
    const pattern = new RegExp(
      `^${token}\\s+(?:[ivxlcdm]+|[0-9]+${preliminar}${unico}${ordinals})\\b`,
      'i'
    );
    return pattern.test(value);
  };

  if (matchesHeadingLead('parte', normalized, { allowPreliminar: false, allowUnico: true, allowOrdinals: true })) {
    return { level: 'parte', heading: clean };
  }
  if (matchesHeadingLead('libro', normalized, { allowUnico: true, allowOrdinals: true })) {
    return { level: 'libro', heading: clean };
  }
  if (matchesHeadingLead('titulo', normalized, { allowPreliminar: true, allowUnico: true, allowOrdinals: true })) {
    return { level: 'titulo', heading: clean };
  }
  if (matchesHeadingLead('capitulo', normalized, { allowUnico: true, allowOrdinals: true })) {
    return { level: 'capitulo', heading: clean };
  }
  if (matchesHeadingLead('seccion', normalized, { allowUnico: true, allowOrdinals: true })) {
    return { level: 'seccion', heading: clean };
  }
  if (matchesHeadingLead('anexo', normalized, { allowUnico: true, allowOrdinals: true })) {
    return { level: 'anexo', heading: clean };
  }
  return null;
};

const looksLikeHeadingDescriptor = (line: string) => {
  const clean = collapseWhitespace(line);
  if (!clean) return false;
  if ((clean.length < 3 || clean.length > 72) && !isShortHeadingDescriptor(clean)) return false;
  if (/[()“”"']/u.test(clean)) return false;
  if (/^(art[ií]culo|art\.)\s*\d+/i.test(clean)) return false;
  if (/[:;!?]/.test(clean)) return false;
  const words = clean.split(' ').filter(Boolean);
  if (words.length > 10) return false;
  if (ARTICLE_TITLE_VERB_PATTERN.test(clean)) return false;
  const normalized = normalizeLoose(clean);
  if (/^(anexo|titulo|capitulo|seccion|libro|parte)$/.test(normalized)) return false;
  if (
    /^(es|son|sera|seran|debe|deben|puede|pueden|tiene|tienen|queda|quedan|rige|rigen|aplica|aplican|corresponde|corresponden|habra|habran|existe|existen)\b/i.test(
      normalized
    )
  ) {
    return false;
  }
  if (normalized.includes('codigo civil y comercial')) return false;
  if (isShortHeadingDescriptor(clean)) return true;
  return /^[A-ZÁÉÍÓÚÑÜ]/.test(clean);
};

const extractInlineArticleTitle = (value?: string | null) => {
  const clean = collapseWhitespace(value)
    .replace(/^[\-\u2013\u2014\u2015\u0097\uFFFD.:;]+\s*/, '')
    .trim();
  if (!clean) return { title: null as string | null, bodyLead: '' };

  const pickTitle = (candidate: string) => {
    const title = collapseWhitespace(candidate).replace(/[.:;,\-–—]+$/g, '').trim();
    if (!title) return null;
    if (title.length < 3 || title.length > 86) return null;
    const words = title.split(' ').filter(Boolean);
    if (words.length > 10) return null;
    if (/[,;:]/.test(title)) return null;
    if (/\d/.test(title)) return null;
    if (ARTICLE_TITLE_VERB_PATTERN.test(title)) return null;
    const normalizedTitle = normalizeLoose(title);
    if (!normalizedTitle) return null;
    if (/^(es|son|sera|seran|debe|deben|puede|pueden|tiene|tienen|queda|quedan|rige|rigen|aplica|aplican|corresponde|corresponden|habra|habran|existe|existen)\b/i.test(normalizedTitle)) return null;
    if (/^(en|de|del|la|las|los|el|si|cuando|que|y|o|por|para|con)\b/i.test(normalizedTitle)) return null;
    if (/\b(en|de|del|la|las|los|el|si|cuando|que|y|o|por|para|con)$/i.test(normalizedTitle)) return null;
    const letters = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z]/g, '');
    if (letters.length >= 22 && letters === letters.toUpperCase()) return null;
    return title;
  };

  const split = clean.match(/^([^.;:]{3,110})\.\s+([\s\S]+)$/);
  if (split && split[1]) {
    const title = pickTitle(split[1]);
    if (title) {
      return { title, bodyLead: collapseWhitespace(split[2] || '') };
    }
  }

  const wholeTitle = pickTitle(clean);
  if (wholeTitle) {
    return { title: wholeTitle, bodyLead: '' };
  }

  return { title: null, bodyLead: clean };
};

const composeArticleTitleWithContext = (headings: string[], inlineTitle?: string | null) => {
  const parts = [...headings.filter(Boolean)];
  if (inlineTitle) parts.push(inlineTitle);
  if (!parts.length) return null;
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const clean = collapseWhitespace(part);
    const key = normalizeLoose(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(clean);
  }
  return deduped.length > 0 ? deduped.join(' | ') : null;
};

const dedupeLinkedRefs = (items: SaijLinkedDocumentRef[]) => {
  const out: SaijLinkedDocumentRef[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeLoose(`${item.guid || ''}|${item.title}|${item.subtitle || ''}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const ANNOTATION_TRIGGER_PATTERN =
  /\b(modificad[oa]|sustituid[oa]|derogad[oa]|incorporad[oa]|texto\s+seg[uú]n|conforme\s+a|observad[oa]|prorrogad[oa]|vigencia|fe\s+de\s+erratas)\b/i;

const buildNormativeRefFromNote = (rawNote: string): SaijLinkedDocumentRef | null => {
  const note = collapseWhitespace(rawNote)
    .replace(/^[\[(\s]+|[\])\s]+$/g, '')
    .trim();
  if (!note || !ANNOTATION_TRIGGER_PATTERN.test(note)) return null;

  const typeNumber = note.match(
    /\b(Ley|Decreto(?:\s+DNU)?|Resoluci[oó]n(?:\s+General)?|Disposici[oó]n(?:\s+T[eé]cnico\s+Registral)?|Decisi[oó]n(?:\s+Administrativa)?|Acordada|Ordenanza)\s*(?:N[°ºo]\s*)?([0-9][0-9.]*([\/-][0-9]{2,4})?)/i
  );
  const articleInRef = note.match(/\bart(?:[ií]culo|\.?)\s*([0-9]+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)/i);

  const title = typeNumber
    ? `${collapseWhitespace(typeNumber[1])} ${collapseWhitespace(typeNumber[2])}`
    : collapseWhitespace(note).slice(0, 96);
  if (!title) return null;

  const subtitleParts = [articleInRef?.[1] ? `Art. ${collapseWhitespace(articleInRef[1])}` : null, note].filter(Boolean);
  const subtitle = subtitleParts.length ? collapseWhitespace(subtitleParts.join(' · ')) : null;

  return {
    title,
    subtitle,
    contentTypeHint: 'legislacion',
    guid: null,
    sourceUrl: null,
    url: `${INFOLEG_BASE_WEB}/infolegInternet`,
  };
};

const extractArticleNormativeNotes = (text: string) => {
  const noteCandidates: string[] = [];
  for (const match of text.matchAll(/\(([^()\n]{18,360})\)/g)) {
    const candidate = collapseWhitespace(match[1]);
    if (ANNOTATION_TRIGGER_PATTERN.test(candidate)) noteCandidates.push(candidate);
  }
  const lines = text.split('\n').map((line) => collapseWhitespace(line));
  for (const line of lines) {
    if (!line || line.length > 360) continue;
    if (!ANNOTATION_TRIGGER_PATTERN.test(line)) continue;
    if (/^(?:art[ií]culo|texto|nota|observaci[oó]n|vigencia)\b/i.test(line) || /^[\[(]/.test(line)) {
      noteCandidates.push(line);
    }
  }

  const refs = dedupeLinkedRefs(
    noteCandidates
      .map((candidate) => buildNormativeRefFromNote(candidate))
      .filter((item): item is SaijLinkedDocumentRef => Boolean(item))
  );

  const normasQueModifica = refs.filter((ref) => {
    const source = `${ref.title} ${ref.subtitle || ''}`;
    return /\b(modifica|sustituye|deroga|incorpora|reemplaza)\b/i.test(source) && !/\bpor\b/i.test(source);
  });
  const normasComplementarias = refs.filter((ref) =>
    /\b(por|seg[uú]n|conforme|observad[oa]|prorrogad[oa]|vigencia)\b/i.test(`${ref.title} ${ref.subtitle || ''}`)
  );
  const observaciones = refs.filter((ref) => !normasQueModifica.includes(ref) && !normasComplementarias.includes(ref));

  const cleanText = collapseMultiline(
    text
      .replace(/\(([^()\n]{18,360})\)/g, (full, inner) => (ANNOTATION_TRIGGER_PATTERN.test(String(inner || '')) ? ' ' : full))
      .split('\n')
      .filter((line) => {
        const clean = collapseWhitespace(line);
        if (!clean) return true;
        if (clean.length > 360) return true;
        if (!ANNOTATION_TRIGGER_PATTERN.test(clean)) return true;
        return !(/^(?:art[ií]culo|texto|nota|observaci[oó]n|vigencia)\b/i.test(clean) || /^[\[(]/.test(clean));
      })
      .join('\n')
  );

  return {
    cleanText,
    normasQueModifica: dedupeLinkedRefs(normasQueModifica),
    normasComplementarias: dedupeLinkedRefs(normasComplementarias),
    observaciones: dedupeLinkedRefs(observaciones),
  };
};

const trimPreludeForCodeBody = (articles: SaijResolvedDocument['articles'], title?: string | null) => {
  if (!Array.isArray(articles) || articles.length < 2) return articles;
  const isCodeTitle = hasLexicalArticleStructure(title);
  if (!isCodeTitle) return articles;

  const candidates = Array.from(
    new Set(
      articles
        .map((article, index) => ({ index, token: normalizeArticleNumberToken(article?.number) }))
        .filter((item) => item.token === '1')
        .map((item) => item.index)
    )
  )
    .filter((index) => index >= 0 && index <= Math.max(0, articles.length - 20))
    .slice(0, 40);

  if (!candidates.includes(0)) candidates.unshift(0);

  const scoreFrom = (startIndex: number) => {
    const window = articles.slice(startIndex, startIndex + 90);
    if (window.length < 20) return Number.NEGATIVE_INFINITY;
    let score = 0;
    let penalties = 0;
    let prevBase: number | null = null;
    const seenLow = new Set<number>();

    for (let i = 0; i < window.length; i += 1) {
      const base = extractArticleBaseNumber(window[i]?.number);
      if (!base) {
        penalties += 1;
        continue;
      }
      if (i === 0) {
        if (base === 1) score += 8;
        else penalties += 10;
      }
      if (base >= 1 && base <= 12) seenLow.add(base);
      if (prevBase != null) {
        if (base === prevBase || base === prevBase + 1) score += 2;
        else if (base > prevBase + 1) penalties += Math.min(5, base - prevBase - 1);
        else penalties += 3;
      }
      prevBase = base;
    }

    score += seenLow.size * 2;
    score -= penalties * 2;
    return score;
  };

  const baseScore = scoreFrom(0);
  let bestIndex = 0;
  let bestScore = baseScore;

  for (const candidate of candidates) {
    const candidateScore = scoreFrom(candidate);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestIndex = candidate;
    }
  }

  if (bestIndex > 0 && bestScore >= baseScore + 12) return articles.slice(bestIndex);
  return articles;
};

const sanitizeArticleTitle = (value?: string | null) => {
  const raw = collapseWhitespace(value);
  if (!raw) return null;

  const STRUCTURAL_PREFIX = /^(anexo|titulo|capitulo|seccion|libro|parte)\b/i;
  const VERBISH_ENDING =
    /\b(es|son|sera|seran|debe|deben|puede|pueden|tiene|tienen|queda|quedan|dispone|disponen|establece|establecen|modifica|modifican|aprueba|aprueban|rige|rigen|aplica|aplican|corresponde|corresponden)\b/i;
  const STRUCTURED_HEADING = /^(anexo|titulo|capitulo|seccion|libro|parte)\s+([a-z0-9]+)(?:\s+(.+))?$/i;

  const isValidHeadingId = (id: string) => {
    const token = normalizeLoose(id);
    if (!token) return false;
    if (/^\d{1,4}$/.test(token)) return true;
    if (/^(preliminar|unico|unica|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta)$/.test(token)) return true;
    if (/^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(token)) {
      return !(token.length === 1 && token === 'l');
    }
    return false;
  };

  const parseStructured = (part: string) => {
    const match = collapseWhitespace(part).match(STRUCTURED_HEADING);
    if (!match || !match[1] || !match[2]) return null;
    const level = normalizeLoose(match[1]);
    const id = normalizeLoose(match[2]);
    if (!isValidHeadingId(id)) return null;
    const descriptor = collapseWhitespace(match[3] || '');
    return { level, id, descriptor };
  };

  const looksLikeHeadingDescriptor = (part: string) => {
    const clean = collapseWhitespace(part);
    if (!clean) return false;
    if (clean.length > 90) return false;
    if (/[:;!?]/.test(clean)) return false;
    if (/\d/.test(clean)) return false;
    const words = clean.split(' ').filter(Boolean);
    if (words.length < 1 || words.length > 10) return false;
    if (VERBISH_ENDING.test(clean)) return false;
    const normalized = normalizeLoose(clean);
    if (!normalized) return false;
    if (STRUCTURAL_PREFIX.test(normalized)) return false;
    if (/^(en|de|del|la|las|los|el|si|cuando|que|y|o|por|para|con)\b/i.test(normalized)) return true;
    return /^[A-ZÁÉÍÓÚÑÜ]/.test(clean);
  };

  const parts = raw
    .split(/\s*(?:\||\/|·|•)\s*/g)
    .map((part) => collapseWhitespace(part).replace(/[.:;,\-]+$/g, '').trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalizeLoose(part);
      if (!normalized) return false;
      if (normalized.includes('codigo civil y comercial de la nacion')) return false;
      if (normalized.startsWith('cuarta')) return false;
      return true;
    });

  if (!parts.length) return null;

  const output: string[] = [];
  const outputMeta: Array<{ key: string; isStructured: boolean; hasDescriptor: boolean }> = [];
  const structuredIndexByKey = new Map<string, number>();
  const seenLoose = new Set<string>();

  for (const part of parts) {
    const looseKey = normalizeLoose(part);
    if (!looseKey || seenLoose.has(looseKey)) continue;
    seenLoose.add(looseKey);

    const structured = parseStructured(part);
    if (structured) {
      const key = `${structured.level}:${structured.id}`;
      const normalizedStructuredLabel = collapseWhitespace(
        `${structured.level.toUpperCase()} ${structured.id.toUpperCase()}${structured.descriptor ? ` ${structured.descriptor}` : ''}`
      );
      const existingIndex = structuredIndexByKey.get(key);
      if (existingIndex == null) {
        structuredIndexByKey.set(key, output.length);
        output.push(normalizedStructuredLabel);
        outputMeta.push({
          key,
          isStructured: true,
          hasDescriptor: Boolean(structured.descriptor),
        });
      } else {
        const existingMeta = outputMeta[existingIndex];
        if (existingMeta && !existingMeta.hasDescriptor && structured.descriptor) {
          output[existingIndex] = normalizedStructuredLabel;
          existingMeta.hasDescriptor = true;
        }
      }
      continue;
    }

    const lastMeta = outputMeta[outputMeta.length - 1];
    if (lastMeta?.isStructured && !lastMeta.hasDescriptor && looksLikeHeadingDescriptor(part)) {
      output[output.length - 1] = collapseWhitespace(`${output[output.length - 1]} ${part}`);
      lastMeta.hasDescriptor = true;
      continue;
    }

    output.push(part);
    outputMeta.push({ key: `part:${output.length}`, isStructured: false, hasDescriptor: false });
  }

  if (!output.length) return null;
  const preliminarIndex = output.findIndex((part) => /^titulo\s+preliminar\b/i.test(normalizeLoose(part)));
  const cleanedOutput = preliminarIndex > 0 ? output.slice(preliminarIndex) : output;
  return cleanedOutput.join(' | ');
};

const parseArticles = (contentText: string) => {
  const articles: SaijResolvedDocument['articles'] = [];
  const lines = String(contentText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const headingByLevel = new Map<SectionLevel, string>();
  const descriptorByLevel = new Map<SectionLevel, string>();
  let pendingDescriptorLevel: SectionLevel | null = null;
  let parsedArticles = 0;
  let preFirstArticleHeadingChanges = 0;
  let pendingNextArticleInlineTitle: string | null = null;

  const getActiveHeadingContext = () => {
    const parts: string[] = [];
    for (const level of SECTION_LEVEL_ORDER) {
      const heading = headingByLevel.get(level);
      if (heading) parts.push(heading);
      const descriptor = descriptorByLevel.get(level);
      if (descriptor) parts.push(descriptor);
    }
    return parts;
  };

  let activeArticle:
    | {
        number: string;
        title: string | null;
        bodyLines: string[];
      }
    | null = null;

  const flushArticle = () => {
    if (!activeArticle) return;
    const rawText = collapseMultiline(activeArticle.bodyLines.join('\n'))
      .replace(/([^\n])\n(?=[^\n])/g, '$1 ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    const extracted = extractArticleNormativeNotes(rawText);
    const text = extracted.cleanText || rawText;
    if (!activeArticle.number || !text) {
      activeArticle = null;
      return;
    }
    articles.push({
      number: activeArticle.number,
      title: activeArticle.title,
      text,
      normasQueModifica: extracted.normasQueModifica,
      normasComplementarias: extracted.normasComplementarias,
      observaciones: extracted.observaciones,
    });
    activeArticle = null;
  };

  const appendHeading = (level: SectionLevel, heading: string) => {
    const levelIndex = SECTION_LEVEL_ORDER.indexOf(level);
    for (const deeper of SECTION_LEVEL_ORDER.slice(levelIndex + 1)) {
      headingByLevel.delete(deeper);
      descriptorByLevel.delete(deeper);
    }
    headingByLevel.set(level, heading);
    descriptorByLevel.delete(level);
    pendingDescriptorLevel = level;
    if (parsedArticles === 0) preFirstArticleHeadingChanges += 1;
  };

  const parseArticleStartLine = (line: string) => {
    const clean = collapseWhitespace(line);
    if (!clean) return null as { number: string; rest: string } | null;

    const parsed = clean.match(
      /^(?:art(?:iculo|(?:i|\u00ED|\u00EC|\u00EF|\u00EE)culo)|art.)\s*([0-9]+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)\s*(?:[????o]|\u00BA|\u00B0)?\s*([\.\-:\u2010-\u2015\u0097\u00AD\uFFFD]*)\s*(.*)$/i
    );
    if (!parsed) return null;

    const separator = collapseWhitespace(parsed[2] || '');
    const rest = collapseWhitespace(parsed[3] || '');
    if (!separator) {
      if (/^[,;]/.test(rest)) return null;
      const first = rest.charAt(0);
      if (first && first.toLowerCase() !== first.toUpperCase() && first === first.toLowerCase()) return null;
    }

    return {
      number: collapseWhitespace(parsed[1]),
      rest,
    };
  };

  const parseStandaloneArticleLabel = (line: string) => {
    const clean = collapseWhitespace(line);
    if (!clean) return null;
    if (clean.length > 96) return null;
    const firstChar = clean.charAt(0);
    const isLetter = firstChar.toLowerCase() !== firstChar.toUpperCase();
    if (!isLetter || firstChar !== firstChar.toUpperCase()) return null;
    if (/^(?:[a-z]|[ivxlcdm]+|\d+)\)\s+/i.test(clean)) return null;
    if (/^(?:art(?:i|\u00ed)culo|art\.)\s*\d+/i.test(clean)) return null;
    if (getSectionHeadingLevel(clean)) return null;
    const numberedHeading = clean
      .replace(/^\d{1,3}\s*(?:[º°o]|\u00BA|\u00B0)?\s*[\.\)\-:]+\s*/i, '')
      .trim();
    if (numberedHeading && numberedHeading !== clean && numberedHeading.length <= 96) {
      const label = collapseWhitespace(String(numberedHeading || '')).replace(/[.:;]+$/g, '').trim();
      if (label && !/[,;]/.test(label)) return label;
    }
    if (/[,;:]/.test(clean)) return null;
    const candidate = extractInlineArticleTitle(clean);
    if (!candidate.title) return null;
    if (candidate.bodyLead) return null;
    return candidate.title;
  };

  for (const rawLine of lines) {
    const cleanLine = collapseWhitespace(rawLine);
    const heading = getSectionHeadingLevel(cleanLine);
    if (heading && activeArticle) {
      flushArticle();
      appendHeading(heading.level, heading.heading);
      continue;
    }
    const articleStart = parseArticleStartLine(cleanLine);
    if (articleStart) {
      flushArticle();
      const number = articleStart.number;
      const inline = extractInlineArticleTitle(articleStart.rest || '');
      const effectiveInlineTitle = inline.title || pendingNextArticleInlineTitle;
      const headingContext = getActiveHeadingContext();
      const effectiveHeadingContext = parsedArticles === 0 && preFirstArticleHeadingChanges >= 8 ? [] : headingContext;
      activeArticle = {
        number,
        title: composeArticleTitleWithContext(effectiveHeadingContext, effectiveInlineTitle),
        bodyLines: inline.bodyLead ? [inline.bodyLead] : [],
      };
      parsedArticles += 1;
      pendingDescriptorLevel = null;
      pendingNextArticleInlineTitle = null;
      continue;
    }

    if (!activeArticle) {
      if (heading) {
        appendHeading(heading.level, heading.heading);
        continue;
      }
      if (pendingDescriptorLevel && looksLikeHeadingDescriptor(cleanLine)) {
        const previousDescriptor = descriptorByLevel.get(pendingDescriptorLevel);
        if (previousDescriptor) {
          descriptorByLevel.set(pendingDescriptorLevel, collapseWhitespace(`${previousDescriptor} ${cleanLine}`));
          pendingDescriptorLevel = null;
          continue;
        }
        descriptorByLevel.set(pendingDescriptorLevel, cleanLine);
        if (isShortHeadingDescriptor(cleanLine)) continue;
        pendingDescriptorLevel = null;
        continue;
      }
      if (cleanLine) pendingDescriptorLevel = null;
      continue;
    }

    if (!cleanLine && activeArticle.bodyLines.length > 0) {
      activeArticle.bodyLines.push('');
      continue;
    }
    if (cleanLine) {
      const standaloneLabel = parseStandaloneArticleLabel(cleanLine);
      if (standaloneLabel) {
        pendingNextArticleInlineTitle = standaloneLabel;
        continue;
      }
      if (pendingNextArticleInlineTitle) {
        activeArticle.bodyLines.push(pendingNextArticleInlineTitle);
        pendingNextArticleInlineTitle = null;
      }
      activeArticle.bodyLines.push(cleanLine);
    }
  }

  flushArticle();
  return articles;
};

const buildTocFromArticles = (articles: SaijResolvedDocument['articles']) => {
  const toc: SaijResolvedDocument['toc'] = [];
  const byKey = new Map<string, { index: number; label: string }>();
  const STRUCTURE_LEVELS = ['parte', 'libro', 'titulo', 'capitulo', 'seccion', 'anexo'] as const;
  type TocLevel = (typeof STRUCTURE_LEVELS)[number];

  const parseStructuredPart = (value: string) => {
    const clean = collapseWhitespace(value);
    if (!clean) return null as { token: TocLevel; id: string; label: string; prefix: string } | null;

    const normalized = normalizeLoose(clean);
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;

    const tokenRaw = tokens[0] || '';
    if (!/^(anexo|titulo|capitulo|seccion|libro|parte)$/i.test(tokenRaw)) return null;
    const token = tokenRaw as TocLevel;

    const idToken = tokens[1] || '';
    const isNumericId = /^\d+$/.test(idToken);
    const isSpecialId = /^(preliminar|unico)$/.test(idToken);
    const isRomanId =
      /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(idToken) &&
      !(idToken.length === 1 && /^l$/i.test(idToken));
    if (!isNumericId && !isSpecialId && !isRomanId) return null;

    const id = idToken;
    const prefixMatch = clean.match(/^(anexo|titulo|capitulo|seccion|libro|parte)\s+\S+/i);
    const prefix = collapseWhitespace(prefixMatch?.[0] || clean);

    let label = clean;
    const normalizedLabel = normalizeLoose(label);
    const suspiciousEnding =
      /\b(es|son|sera|seran|debe|deben|puede|pueden|tiene|tienen|queda|quedan|que|se|la|las|los|del|de|en|y|o|por|para|con)$/i.test(
        normalizedLabel
      );
    const suspiciousDoubleRoman = /^(seccion|capitulo|titulo|libro|parte|anexo)\s+[ivxlcdm]+\s+[ivxlcdm]+\b/i.test(normalizedLabel);
    if (label.length > 90 || suspiciousEnding || suspiciousDoubleRoman) {
      label = prefix;
    }

    return { token, id, label, prefix };
  };

  for (const article of articles) {
    const parts = String(article.title || '')
      .split(/\s*(?:\||\/|\u00B7)\s*/g)
      .map((part) => collapseWhitespace(part))
      .filter(Boolean);

    const contextByLevel = new Map<TocLevel, string>();

    for (const part of parts) {
      const structured = parseStructuredPart(part);
      if (!structured) continue;

      const levelIndex = STRUCTURE_LEVELS.indexOf(structured.token);
      for (const deeper of STRUCTURE_LEVELS.slice(levelIndex + 1)) {
        contextByLevel.delete(deeper);
      }

      const parentPath = STRUCTURE_LEVELS.slice(0, levelIndex)
        .map((lvl) => contextByLevel.get(lvl))
        .filter(Boolean)
        .join('>');
      const sectionId = `${structured.token}:${structured.id}`;
      const uniqueKey = `${parentPath}>${sectionId}`;
      contextByLevel.set(structured.token, sectionId);

      const existing = byKey.get(uniqueKey);
      if (!existing) {
        byKey.set(uniqueKey, { index: toc.length, label: structured.label });
        toc.push({ label: structured.label, anchor: '#section-' + String(toc.length + 1) });
        if (toc.length >= 350) return toc;
        continue;
      }

      const prev = existing.label;
      const prevPrefixOnly = normalizeLoose(prev) === normalizeLoose(structured.prefix);
      const nextHasDescriptor = normalizeLoose(structured.label) !== normalizeLoose(structured.prefix);
      const nextBetterLength = structured.label.length <= 90 && structured.label.length >= prev.length;
      if (prevPrefixOnly && nextHasDescriptor && nextBetterLength) {
        toc[existing.index] = { ...toc[existing.index], label: structured.label };
        byKey.set(uniqueKey, { index: existing.index, label: structured.label });
      }
    }
  }

  return toc;
};

const parseRelatedRefs = (html: string): SaijLinkedDocumentRef[] => {
  const $ = load(html);
  const refs: SaijLinkedDocumentRef[] = [];
  const seen = new Set<string>();

  $('table tr').each((_, row) => {
    const link = $(row).find('a[href*="verNorma.do"][href*="id="]').first();
    const href = link.attr('href') || '';
    const id = parseInfolegId(href);
    if (!id || seen.has(id)) return;

    const columns = $(row).find('td');
    if (columns.length < 3) return;

    const rowTitle = sanitizeSearchTitle($(columns[0]).text()) || sanitizeSearchTitle(link.text());
    const rowDescription = sanitizeSearchSubtitle($(columns[2]).text()) || null;
    const title = rowTitle || sanitizeSearchTitle(link.text());
    if (!title) return;

    const subtitle = rowDescription || null;
    const sourceUrl = toAbsoluteInfolegUrl(href);
    if (!sourceUrl) return;

    seen.add(id);
    refs.push({
      title,
      subtitle,
      contentTypeHint: 'legislacion',
      guid: `infoleg:${id}`,
      sourceUrl,
      url: sourceUrl,
    });
  });

  return refs;
};

const isNationalCodeCatalogRequest = (input: SaijSearchRequest) => {
  if (input.contentType !== 'legislacion' && input.contentType !== 'todo') return false;
  const hasSearchTerms = Boolean(
    collapseWhitespace(input.filters?.numeroNorma) ||
      collapseWhitespace(input.filters?.textoEnNorma) ||
      collapseWhitespace(input.filters?.titulo) ||
      collapseWhitespace(input.filters?.tema)
  );
  if (hasSearchTerms) return false;
  const tipo = normalizeLoose(input.filters?.tipoNorma);
  const isCodeType = tipo === 'codigo' || tipo === 'codigo_nacional';
  if (!isCodeType) return false;
  const jurisdiction = input.filters?.jurisdiccion?.kind ?? 'todas';
  return jurisdiction === 'nacional' || jurisdiction === 'todas';
};

const isProvincialCodeCatalogRequest = (input: SaijSearchRequest) => {
  if (input.contentType !== 'legislacion' && input.contentType !== 'todo') return false;
  const hasSearchTerms = Boolean(
    collapseWhitespace(input.filters?.numeroNorma) ||
      collapseWhitespace(input.filters?.textoEnNorma) ||
      collapseWhitespace(input.filters?.titulo) ||
      collapseWhitespace(input.filters?.tema)
  );
  if (hasSearchTerms) return false;
  const tipo = normalizeLoose(input.filters?.tipoNorma);
  const isCodeType = tipo === 'codigo_provincial';
  if (!isCodeType) return false;
  const jurisdiction = input.filters?.jurisdiccion?.kind ?? 'todas';
  return jurisdiction === 'provincial';
};

export class InfolegService {
  private readonly searchCache = new Map<string, CachedSearchEntry>();

  private async getDocumentByDirectUrl(
    guid: string,
    sourceAbsoluteUrl: string,
    options?: { debug?: boolean }
  ): Promise<SaijDocumentResponse> {
    const detail = await this.requestHtml(sourceAbsoluteUrl, { method: 'GET', absolute: true });
    if (detail.status >= 400) {
      throw new HttpError(502, 'infoleg_detail_error', `Infoleg devolvió ${detail.status} al consultar documento provincial`);
    }

    const $ = load(detail.html);
    const title =
      collapseWhitespace($('h1').first().text()) ||
      collapseWhitespace($('h2').first().text()) ||
      collapseWhitespace($('title').first().text()) ||
      'Código provincial';
    const subtitle = collapseWhitespace($('h3').first().text()) || null;

    const contentHtml = detail.html || null;
    const contentText = contentHtml ? extractTextWithBreaks(contentHtml) : null;
    const articlesBase = contentText ? parseArticles(contentText) : [];
    const articles = articlesBase.map((article) => ({
      ...article,
      title: sanitizeArticleTitle(article.title),
    }));
    const toc = articles.length > 0 ? buildTocFromArticles(articles) : [];
    const hasRenderableContent = Boolean((contentText && contentText.length > 0) || (contentHtml && contentHtml.length > 0));

    const document: SaijResolvedDocument = {
      guid,
      title,
      subtitle,
      contentType: 'legislacion',
      numeroNorma: null,
      tipoNorma: 'Código provincial',
      smartCitation: {
        numero: null,
        tipo: 'Código provincial',
        nombre: title,
      },
      documentSubtype: subtitle,
      estadoVigencia: null,
      tribunal: null,
      fechaSentencia: null,
      autor: null,
      organismo: null,
      metadata: {
        source: 'infoleg-provincial-catalog',
        detailUrl: sourceAbsoluteUrl,
      },
      contentHtml,
      contentText,
      headerText: null,
      articles,
      toc,
      friendlyUrl: sourceAbsoluteUrl,
      sourceUrl: sourceAbsoluteUrl,
      attachment: {
        guid: null,
        fileName: sourceAbsoluteUrl.split('/').pop() || null,
        url: sourceAbsoluteUrl,
        fallbackUrl: sourceAbsoluteUrl,
      },
      normasQueModifica: [],
      normasComplementarias: [],
      observaciones: [],
      relatedFallos: [],
      relatedContents: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      hasRenderableContent,
      contentUnavailableReason: hasRenderableContent ? null : 'infoleg_no_text',
      friendlyUrlParts: {
        raw: { source: 'infoleg-provincial-catalog', url: sourceAbsoluteUrl },
        subdomain: 'infoleg.gob.ar',
        description: 'provincial-code',
      },
    };

    return {
      ok: true,
      document,
      debugInfo: options?.debug
        ? {
            strategyUsed: 'view-document',
            externalUrl: detail.finalUrl,
            externalContentType: 'text/html',
            hasRenderableContent,
            articleCount: articles.length,
          }
        : undefined,
    };
  }

  async search(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    const cacheKey = JSON.stringify({
      contentType: input.contentType,
      filters: input.filters,
      offset: input.offset,
      pageSize: input.pageSize,
    });
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    if (isNationalCodeCatalogRequest(input)) {
      const result = await this.searchNationalCodesCatalog(input);
      this.setSearchCache(cacheKey, result);
      return result;
    }
    if (isProvincialCodeCatalogRequest(input)) {
      const result = await this.searchProvincialCodesCatalog(input);
      this.setSearchCache(cacheKey, result);
      return result;
    }

    const criteria = this.buildCriteria(input);

    if (!criteria.numero && !criteria.texto && !criteria.tipoNorma) {
      const emptyResult = {
        ok: true,
        query: { r: '', f: 'infoleg', offset: input.offset, pageSize: input.pageSize },
        total: 0,
        hits: [],
        facets: [],
      };
      this.setSearchCache(cacheKey, emptyResult);
      return emptyResult;
    }

    const requestedOffset = Math.max(0, input.offset);
    const requestedPageSize = Math.max(1, Math.min(50, input.pageSize || INFOLEG_DEFAULT_PAGE_SIZE));
    const baseNeeded = requestedOffset + requestedPageSize;
    const needed = criteria.preferredTitleToken ? Math.max(baseNeeded, 300) : baseNeeded;

    const primaryRun = await this.collectHitsForCriteria(criteria, needed, INFOLEG_MAX_FETCH_PAGES);
    let total = primaryRun.total;
    const collected: SaijSearchHit[] = [...primaryRun.hits];

    if (criteria.numero && collected.length === 0) {
      const fallbackPlans = this.buildNumberFallbackCriteria(criteria);
      for (const fallbackCriteria of fallbackPlans) {
        const fallbackRun = await this.collectHitsForCriteria(
          fallbackCriteria,
          Math.max(requestedPageSize, INFOLEG_DEFAULT_PAGE_SIZE),
          INFOLEG_NUMBER_FALLBACK_MAX_PAGES
        );
        if (fallbackRun.hits.length > 0) {
          collected.push(...fallbackRun.hits);
          total = Math.max(total, fallbackRun.total);
        }
      }
    }

    const dedup = new Map<string, SaijSearchHit>();
    for (const hit of collected) {
      if (!dedup.has(hit.guid)) dedup.set(hit.guid, hit);
    }
    let ordered = Array.from(dedup.values());
    if (criteria.numero) {
      ordered = this.rankNumberMatches(ordered, criteria);
    }
    if (criteria.preferredTitleToken) {
      const token = normalizeLoose(criteria.preferredTitleToken);
      const narrowed = ordered.filter((hit) => {
        const title = normalizeLoose(hit.title || '');
        const subtitle = normalizeLoose(hit.subtitle || '');
        return title.includes(token) || subtitle.includes(token);
      });
      if (narrowed.length > 0) {
        const uniqueByTitle = new Map<string, SaijSearchHit>();
        for (const hit of narrowed) {
          const titleKey = normalizeLoose(hit.title || '');
          if (!titleKey) continue;
          if (!uniqueByTitle.has(titleKey)) uniqueByTitle.set(titleKey, hit);
        }
        const titleDeduped = Array.from(uniqueByTitle.values());
        ordered = titleDeduped.length > 0 ? titleDeduped : narrowed;
      }
    }
    const pageHits = ordered.slice(requestedOffset, requestedOffset + requestedPageSize);

    const response = {
      ok: true,
      query: {
        r: [criteria.numero, criteria.texto].filter(Boolean).join(' '),
        f: `infoleg:tipoNorma=${criteria.tipoNorma || 'all'}`,
        offset: requestedOffset,
        pageSize: requestedPageSize,
      },
      total: Math.max(total, ordered.length),
      hits: pageHits,
      facets: [],
    };
    this.setSearchCache(cacheKey, response);
    return response;
  }

  private setSearchCache(key: string, payload: SaijSearchResponse) {
    this.searchCache.set(key, {
      expiresAt: Date.now() + INFOLEG_SEARCH_CACHE_TTL_MS,
      payload,
    });
    if (this.searchCache.size > 150) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) this.searchCache.delete(firstKey);
    }
  }

  private async collectHitsForCriteria(criteria: SearchCriteria, needed: number, maxPages: number) {
    const collected: SaijSearchHit[] = [];
    let currentPage = 1;
    let total = 0;
    let totalPages = 1;

    while (currentPage <= maxPages && collected.length < needed) {
      let parsed: ParsedSearchPage;
      try {
        parsed = await this.fetchSearchPage(criteria, currentPage);
      } catch (error) {
        if (currentPage === 1) throw error;
        break;
      }
      if (currentPage === 1) {
        total = parsed.total;
        totalPages = Math.max(1, parsed.totalPages);
      }
      if (!parsed.hits.length) break;
      collected.push(...parsed.hits);

      if (currentPage >= totalPages) break;
      currentPage += 1;
    }

    return { total, hits: collected };
  }

  private buildNumberFallbackCriteria(criteria: SearchCriteria): SearchCriteria[] {
    const plans: SearchCriteria[] = [];
    const plannedKeys = new Set<string>();

    const pushPlan = (partial: { tipoNorma?: string; texto?: string }) => {
      const tipoNorma = partial.tipoNorma || undefined;
      const texto = collapseWhitespace(partial.texto);
      const key = `${tipoNorma || ''}|${texto || ''}|${criteria.numero || ''}|${criteria.anioSancion || ''}`;
      if (plannedKeys.has(key)) return;
      plannedKeys.add(key);

      plans.push({
        tipoNorma,
        numero: criteria.numero,
        anioSancion: criteria.anioSancion,
        texto: texto || undefined,
        preferredTitleToken: criteria.preferredTitleToken,
      });
    };

    if (criteria.tipoNorma) {
      pushPlan({ tipoNorma: criteria.tipoNorma, texto: this.getTipoSearchText(criteria.tipoNorma) });
    }

    pushPlan({ tipoNorma: '1', texto: 'ley' });
    pushPlan({ tipoNorma: '2', texto: 'decreto' });
    pushPlan({ tipoNorma: '8', texto: 'decision administrativa' });
    pushPlan({ tipoNorma: '3', texto: 'resolucion' });
    pushPlan({ tipoNorma: '4', texto: 'disposicion' });
    pushPlan({ tipoNorma: '12', texto: 'acordada' });

    return plans;
  }

  private getTipoSearchText(tipoNorma?: string) {
    if (!tipoNorma) return '';
    if (tipoNorma === '1') return 'ley';
    if (tipoNorma === '2') return 'decreto';
    if (tipoNorma === '3') return 'resolucion';
    if (tipoNorma === '4') return 'disposicion';
    if (tipoNorma === '8') return 'decision administrativa';
    if (tipoNorma === '12') return 'acordada';
    return '';
  }

  private rankNumberMatches(hits: SaijSearchHit[], criteria: SearchCriteria) {
    const expectedNumber = normalizeNormNumber(criteria.numero || '');
    const expectedMainNumber = expectedNumber.split('/')[0] || '';
    const expectedTipoText = normalizeLoose(this.getTipoSearchText(criteria.tipoNorma));
    const expectedNumberNormalized = normalizeLoose(expectedNumber);
    const expectedMainNumberNormalized = normalizeLoose(expectedMainNumber);
    const textTokens = normalizeLoose(criteria.texto || '')
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 2);

    const scoreHit = (hit: SaijSearchHit) => {
      const haystack = normalizeLoose([hit.title, hit.subtitle, hit.summary].filter(Boolean).join(' '));
      const spaced = ` ${haystack} `;
      let score = 0;

      if (expectedNumberNormalized && spaced.includes(` ${expectedNumberNormalized} `)) score += 240;
      if (expectedMainNumberNormalized && spaced.includes(` ${expectedMainNumberNormalized} `)) score += 160;
      if (expectedTipoText && haystack.includes(expectedTipoText)) score += 80;
      if (textTokens.length > 0) {
        for (const token of textTokens) {
          if (haystack.includes(token)) score += 14;
        }
      }
      if (expectedMainNumberNormalized && !spaced.includes(` ${expectedMainNumberNormalized} `)) score -= 180;
      if (hit.fecha) score += 5;

      return score;
    };

    return [...hits].sort((a, b) => {
      const scoreDiff = scoreHit(b) - scoreHit(a);
      if (scoreDiff !== 0) return scoreDiff;
      const aDate = Date.parse(a.fecha || '');
      const bDate = Date.parse(b.fecha || '');
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
    });
  }

  private async searchNationalCodesCatalog(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    const requestedOffset = Math.max(0, input.offset);
    const requestedPageSize = Math.max(1, Math.min(50, input.pageSize || INFOLEG_DEFAULT_PAGE_SIZE));
    const page = await this.requestHtml('https://www.infoleg.gob.ar/?page_id=67', { method: 'GET', absolute: true });
    if (page.status >= 400) {
      throw new HttpError(502, 'infoleg_codes_catalog_error', `Infoleg devolviÃ³ ${page.status} al consultar cÃ³digos nacionales`);
    }

    const $ = load(page.html);
    const hits: SaijSearchHit[] = [];
    const seen = new Set<string>();

    $('li a[href*="verNorma.do"][href*="id="]').each((_, node) => {
      const href = $(node).attr('href') || '';
      const id = parseInfolegId(href);
      if (!id || seen.has(id)) return;
      seen.add(id);

      const title = collapseWhitespace($(node).text());
      if (!title) return;
      if (!normalizeLoose(title).includes('codigo')) return;

      const sourceUrl = toAbsoluteInfolegUrl(href) || `${env.infolegBaseUrl}/verNorma.do?id=${id}`;
      hits.push({
        guid: `infoleg:${id}`,
        title,
        subtitle: 'CÃ³digo nacional',
        summary: null,
        contentType: 'legislacion',
        fecha: null,
        estado: null,
        jurisdiccion: 'Nacional',
        fuente: 'Infoleg',
        friendlyUrl: sourceUrl,
        sourceUrl,
        friendlyUrlParts: {
          raw: { source: 'infoleg', id },
          subdomain: 'servicios.infoleg.gob.ar',
          description: `verNorma.do?id=${id}`,
        },
      });
    });

    const uniqueByTitle = new Map<string, SaijSearchHit>();
    for (const hit of hits) {
      const key = normalizeLoose(hit.title || '');
      if (!key || uniqueByTitle.has(key)) continue;
      uniqueByTitle.set(key, hit);
    }
    const ordered = Array.from(uniqueByTitle.values()).sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'es')
    );
    const pageHits = ordered.slice(requestedOffset, requestedOffset + requestedPageSize);

    return {
      ok: true,
      query: {
        r: 'catalogo-codigos-nacionales',
        f: 'infoleg:catalog',
        offset: requestedOffset,
        pageSize: requestedPageSize,
      },
      total: ordered.length,
      hits: pageHits,
      facets: [],
    };
  }

  private async searchProvincialCodesCatalog(input: SaijSearchRequest): Promise<SaijSearchResponse> {
    const requestedOffset = Math.max(0, input.offset);
    const requestedPageSize = Math.max(1, Math.min(50, input.pageSize || INFOLEG_DEFAULT_PAGE_SIZE));
    const provinceRaw = collapseWhitespace(input.filters?.jurisdiccion?.provincia || '');
    const provinceNeedle = normalizeLoose(provinceRaw);
    if (!provinceNeedle) {
      return {
        ok: true,
        query: {
          r: '',
          f: 'infoleg:codes-provincial',
          offset: requestedOffset,
          pageSize: requestedPageSize,
        },
        total: 0,
        hits: [],
        facets: [],
      };
    }

    const page = await this.requestHtml('https://www.infoleg.gob.ar/?page_id=87', { method: 'GET', absolute: true });
    if (page.status >= 400) {
      throw new HttpError(502, 'infoleg_codes_catalog_error', `Infoleg devolvió ${page.status} al consultar códigos provinciales`);
    }

    const $ = load(page.html);
    const hits: SaijSearchHit[] = [];
    const seen = new Set<string>();

    const normalizeProvinceKey = (value?: string | null) =>
      normalizeLoose(value)
        .replace(/\bc[aá]doba\b/g, 'cordoba')
        .replace(/\bbuenos aires ciudad\b/g, 'ciudad autonoma de buenos aires')
        .replace(/\bcaba\b/g, 'ciudad autonoma de buenos aires');

    const provinceMatches = (heading: string) => {
      const normalized = normalizeProvinceKey(heading);
      const needle = normalizeProvinceKey(provinceNeedle);
      return normalized.includes(needle) || needle.includes(normalized);
    };

    $('h2').each((_, headingNode) => {
      const headingLabel = collapseWhitespace($(headingNode).text());
      if (!headingLabel || !provinceMatches(headingLabel)) return;

      let cursor = $(headingNode).next();
      while (cursor.length && cursor[0].tagName !== 'h2') {
        cursor.find('a[href]').each((__, linkNode) => {
          const hrefRaw = $(linkNode).attr('href') || '';
          const titleRaw = collapseWhitespace($(linkNode).text());
          const title = titleRaw || null;
          if (!title) return;

          const titleNeedle = normalizeLoose(title);
          if (!titleNeedle.includes('codigo') && !titleNeedle.includes('normas de procedimiento') && !titleNeedle.includes('ley de ejecucion penal')) {
            return;
          }

          const href = toAbsoluteInfolegUrl(hrefRaw) || (hrefRaw.startsWith('http') ? hrefRaw : `https://${hrefRaw.replace(/^\/+/, '')}`);
          const guid = `infoleg-prov:${Buffer.from(href).toString('base64url')}`;
          if (seen.has(guid)) return;
          seen.add(guid);

          hits.push({
            guid,
            title,
            subtitle: `Código provincial · ${headingLabel}`,
            summary: null,
            contentType: 'legislacion',
            fecha: null,
            estado: null,
            jurisdiccion: headingLabel,
            fuente: 'Infoleg',
            friendlyUrl: href,
            sourceUrl: href,
            friendlyUrlParts: {
              raw: { source: 'infoleg-provincial-catalog', province: headingLabel },
              subdomain: 'infoleg.gob.ar',
              description: 'page_id=87',
            },
          });
        });
        cursor = cursor.next();
      }
    });

    const ordered = hits.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
    const pageHits = ordered.slice(requestedOffset, requestedOffset + requestedPageSize);
    return {
      ok: true,
      query: {
        r: provinceRaw,
        f: 'infoleg:codes-provincial-catalog',
        offset: requestedOffset,
        pageSize: requestedPageSize,
      },
      total: ordered.length,
      hits: pageHits,
      facets: [],
    };
  }

  async getDocumentByGuid(guid: string, options?: { debug?: boolean }): Promise<SaijDocumentResponse> {
    const provUrl = parseInfolegProvUrl(guid);
    if (provUrl) {
      return await this.getDocumentByDirectUrl(guid, provUrl, options);
    }

    const infolegId = parseInfolegId(guid);
    if (!infolegId) {
      throw new HttpError(400, 'invalid_guid', 'GUID invÃ¡lido para Infoleg');
    }

    const detailPath = `/verNorma.do?id=${encodeURIComponent(infolegId)}`;
    const detail = await this.requestHtml(detailPath, { method: 'GET' });
    if (detail.status >= 400) {
      throw new HttpError(502, 'infoleg_detail_error', `Infoleg devolviÃ³ ${detail.status} en verNorma`);
    }

    const $ = load(detail.html);
    const container = $('#Textos_Completos');
    if (!container.length) {
      throw new HttpError(502, 'infoleg_invalid_detail', 'No se pudo parsear el detalle de Infoleg');
    }

    const headerStrong = collapseWhitespace(container.find('p strong').first().text());
    const dateText = collapseWhitespace(container.find('.vr_azul11').first().text()) || null;
    const title = collapseWhitespace(container.find('.destacado').first().text()) || headerStrong || `Norma ${infolegId}`;
    const subtitle = collapseWhitespace(container.find('h1').first().text()) || null;

    const headerTypeNumber = headerStrong.match(
      /(Ley|Decreto(?:\s+Reglamentario)?|Decreto\s*DNU|Resoluci[oÃ³]n(?:\s+General)?|Disposici[oÃ³]n|Decisi[oÃ³]n(?:\s+Administrativa)?|Acordada)\s+([0-9]+(?:\/[0-9]{2,4})?)/i
    );
    const tipoNorma = headerTypeNumber ? collapseWhitespace(headerTypeNumber[1]) : null;
    const numeroNorma = headerTypeNumber ? collapseWhitespace(headerTypeNumber[2]) : null;

    const paragraphs = container.find('p');
    let summary: string | null = null;
    let observaciones: string | null = null;
    let antecedentesNormativos: string | null = null;
    paragraphs.each((_, p) => {
      const raw = collapseMultiline($(p).text());
      const normalized = raw.toLowerCase();
      if (!summary && normalized.startsWith('resumen:')) {
        summary = collapseMultiline(raw.replace(/^resumen:\s*/i, ''));
      }
      if (!observaciones && normalized.startsWith('observaciones:')) {
        observaciones = collapseMultiline(raw.replace(/^observaciones:\s*/i, ''));
      }
    });

    const antecedentesHrefFromDom = container
      .find('a[href]')
      .toArray()
      .find((node) => normalizeLoose($(node).text()).includes('antecedentes normativos'));
    const antecedentesHrefFromRegex =
      detail.html.match(/href\s*=\s*['"]([^'"]+)['"][^>]*>\s*ver\s+antecedentes\s+normativos/i)?.[1] || null;
    const antecedentesHrefFromNode = antecedentesHrefFromDom ? collapseWhitespace($(antecedentesHrefFromDom).attr('href') || '') : '';
    const antecedentesHref = collapseWhitespace(antecedentesHrefFromNode || antecedentesHrefFromRegex || '');
    const antecedentesUrl = antecedentesHref ? toAbsoluteInfolegUrl(antecedentesHref) : null;
    if (antecedentesUrl) {
      const antecedentesResponse = await this.requestHtml(antecedentesUrl, { method: 'GET', absolute: true });
      if (antecedentesResponse.status < 400 && antecedentesResponse.html) {
        const antecedentesDom = load(antecedentesResponse.html);
        const antecedenteContainerHtml =
          antecedentesDom('#Textos_Completos').first().html() || antecedentesDom('body').first().html() || '';
        antecedentesNormativos = extractTextWithBreaks(antecedenteContainerHtml) || null;
      }
    }

    const annexLinksFromDom = container
      .find('a[href*="anexos/"]')
      .toArray()
      .map((a) => toAbsoluteInfolegUrl($(a).attr('href')))
      .filter((u): u is string => Boolean(u));
    const annexLinksFromRegex = Array.from(
      detail.html.matchAll(/href\s*=\s*['"]([^'"]*anexos\/[^'"]+\.(?:htm|pdf)[^'"]*)['"]/gi)
    )
      .map((match) => toAbsoluteInfolegUrl(match[1]))
      .filter((u): u is string => Boolean(u));
    const annexLinks = Array.from(new Set([...annexLinksFromDom, ...annexLinksFromRegex]));

    const preferredContentUrl =
      annexLinks.find((u) => /\/texact\.htm(?:$|\?)/i.test(u)) ||
      annexLinks.find((u) => /\/norma\.htm(?:$|\?)/i.test(u)) ||
      null;

    let contentHtml: string | null = null;
    let contentText: string | null = null;
    let articles: SaijResolvedDocument['articles'] = [];
    let toc: SaijResolvedDocument['toc'] = [];

    if (preferredContentUrl) {
      const content = await this.requestHtml(preferredContentUrl, { method: 'GET', absolute: true });
      if (content.status < 400 && content.html) {
        contentHtml = content.html;
        contentText = extractTextWithBreaks(content.html) || null;
        if (contentText) {
          articles = parseArticles(contentText);
        }
        const tocRoot = load(content.html);
        toc = tocRoot('a[name]')
          .toArray()
          .reduce<SaijResolvedDocument['toc']>((acc, node) => {
            const anchor = collapseWhitespace(tocRoot(node).attr('name'));
            const label = collapseWhitespace(tocRoot(node).text());
            if (!anchor || !label) return acc;
            acc.push({ label, anchor: `#${anchor}` });
            return acc;
          }, [])
          .slice(0, 300);
      }
    }

    const detailFallbackHtml = `<div>${container.html() || ''}</div>`;
    const detailFallbackText = extractTextWithBreaks(detailFallbackHtml);
    if (!contentText || (articles.length === 0 && contentText.length < 4000)) {
      if (!contentHtml && detailFallbackHtml.trim()) {
        contentHtml = detailFallbackHtml;
      }
      if (detailFallbackText) {
        contentText = detailFallbackText;
        if (articles.length === 0) {
          articles = parseArticles(detailFallbackText);
        }
      }
    }
    if (articles.length > 0) {
      articles = trimPreludeForCodeBody(articles, title);
      articles = articles.map((article) => ({
        ...article,
        title: sanitizeArticleTitle(article.title),
      }));
    }

    const tocFromArticles = articles.length > 0 ? buildTocFromArticles(articles) : [];
    if (tocFromArticles.length > 0) {
      toc = tocFromArticles;
    }

    const relatedLinksFromDom = container.find('a[href*="verVinculos.do"]');
    const relatedLinksFromRegex = Array.from(detail.html.matchAll(/href\s*=\s*['"]([^'"]*verVinculos\.do[^'"]*)['"]/gi))
      .map((match) => toAbsoluteInfolegUrl(match[1]))
      .filter((u): u is string => Boolean(u));
    const relatedLinks = [
      ...relatedLinksFromDom.toArray().map((a) => toAbsoluteInfolegUrl($(a).attr('href'))),
      ...relatedLinksFromRegex,
    ].filter((u): u is string => Boolean(u));

    const modificaLink = relatedLinks.find((u) => Boolean(u && /[?&]modo=1\b/i.test(u || '')));
    const complementariasLink = relatedLinks.find((u) => Boolean(u && /[?&]modo=2\b/i.test(u || '')));

    let normasQueModifica: SaijLinkedDocumentRef[] = [];
    let normasComplementarias: SaijLinkedDocumentRef[] = [];

    if (modificaLink) {
      const related = await this.requestHtml(modificaLink, { method: 'GET', absolute: true });
      if (related.status < 400) normasQueModifica = parseRelatedRefs(related.html);
    }
    if (complementariasLink) {
      const related = await this.requestHtml(complementariasLink, { method: 'GET', absolute: true });
      if (related.status < 400) normasComplementarias = parseRelatedRefs(related.html);
    }

    const articleNormasQueModifica = dedupeLinkedRefs(
      articles.flatMap((article) => (Array.isArray(article?.normasQueModifica) ? article.normasQueModifica : []))
    );
    const articleNormasComplementarias = dedupeLinkedRefs(
      articles.flatMap((article) => (Array.isArray(article?.normasComplementarias) ? article.normasComplementarias : []))
    );

    normasQueModifica = dedupeLinkedRefs([...(normasQueModifica || []), ...articleNormasQueModifica]);
    normasComplementarias = dedupeLinkedRefs([...(normasComplementarias || []), ...articleNormasComplementarias]);

    const hasRenderableContent = Boolean((contentText && contentText.length > 0) || (contentHtml && contentHtml.length > 0));
    const sourceUrl = toAbsoluteInfolegUrl(`/infolegInternet/verNorma.do?id=${infolegId}`) || detail.finalUrl;

    const document: SaijResolvedDocument = {
      guid: `infoleg:${infolegId}`,
      title,
      subtitle,
      contentType: 'legislacion',
      numeroNorma,
      tipoNorma,
      smartCitation: {
        numero: numeroNorma,
        tipo: tipoNorma,
        nombre: title,
      },
      documentSubtype: subtitle,
      estadoVigencia: null,
      tribunal: null,
      fechaSentencia: null,
      autor: null,
      organismo: null,
      metadata: {
        source: 'infoleg',
        infolegId,
        detailUrl: sourceUrl,
        publicationDate: dateText,
        summary,
        observaciones,
        antecedentesNormativos,
      },
      contentHtml,
      contentText,
      headerText: headerStrong || null,
      articles,
      toc,
      friendlyUrl: sourceUrl,
      sourceUrl,
      attachment:
        preferredContentUrl || annexLinks.length > 0
          ? {
              guid: null,
              fileName: preferredContentUrl ? preferredContentUrl.split('/').pop() || null : null,
              url: preferredContentUrl || annexLinks[0] || null,
              fallbackUrl: annexLinks[0] || null,
            }
          : null,
      normasQueModifica,
      normasComplementarias,
      observaciones: observaciones
        ? [
            {
              title: observaciones,
              contentTypeHint: 'legislacion',
              sourceUrl,
              url: sourceUrl,
            },
          ]
        : [],
      relatedFallos: [],
      relatedContents: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      hasRenderableContent,
      contentUnavailableReason: hasRenderableContent ? null : 'infoleg_no_text',
      friendlyUrlParts: {
        raw: { source: 'infoleg', id: infolegId },
        subdomain: 'servicios.infoleg.gob.ar',
        description: `verNorma.do?id=${infolegId}`,
      },
    };

    return {
      ok: true,
      document,
      debugInfo: options?.debug
        ? {
            strategyUsed: 'view-document',
            externalUrl: detail.finalUrl,
            externalContentType: 'text/html',
            hasRenderableContent,
            articleCount: articles.length,
          }
        : undefined,
    };
  }

  async debugDocument(guid: string) {
    const provUrl = parseInfolegProvUrl(guid);
    if (provUrl) {
      return {
        ok: true,
        source: 'infoleg-provincial-catalog',
        guid,
        url: provUrl,
      };
    }
    const infolegId = parseInfolegId(guid);
    if (!infolegId) {
      throw new HttpError(400, 'invalid_guid', 'GUID invÃ¡lido para Infoleg');
    }
    return {
      ok: true,
      source: 'infoleg',
      guid: `infoleg:${infolegId}`,
      url: `${env.infolegBaseUrl}/verNorma.do?id=${infolegId}`,
    };
  }

  private buildCriteria(input: SaijSearchRequest): SearchCriteria {
    const tipoInfo = resolveTipoNormaAndHints(input.filters?.tipoNorma);
    const numeroNormaRaw = normalizeNormNumber(input.filters?.numeroNorma);
    const numeroNorma = numeroNormaRaw.includes('/') ? numeroNormaRaw.split('/')[0] || numeroNormaRaw : numeroNormaRaw;
    const baseTextQuery = collapseWhitespace(input.filters?.textoEnNorma || input.filters?.titulo || input.filters?.tema || '');
    const hints: string[] = [...tipoInfo.hints];

    const facetTema = extractFacetLeaf(input.filters?.facetTema);
    const facetOrganismo = extractFacetLeaf(input.filters?.facetOrganismo);
    const facetJurisdiccion = extractFacetLeaf(input.filters?.facetJurisdiccion);
    const facetEstado = extractFacetLeaf(input.filters?.facetEstadoVigencia);

    if (facetTema) hints.push(facetTema);
    if (facetOrganismo) hints.push(facetOrganismo);
    if (facetJurisdiccion) hints.push(facetJurisdiccion);
    if (facetEstado) hints.push(facetEstado);

    if (input.filters?.jurisdiccion?.kind === 'provincial' && input.filters?.jurisdiccion?.provincia) {
      hints.push(input.filters.jurisdiccion.provincia);
    }

    if (input.contentType && input.contentType !== 'legislacion' && input.contentType !== 'todo') {
      hints.push(input.contentType);
    }

    const textQuery = collapseWhitespace([baseTextQuery, ...hints].filter(Boolean).join(' '));

    let anioSancion = normalizeYear(input.filters?.fechaDesde);
    if (!anioSancion && numeroNormaRaw.includes('/')) {
      const yearPart = numeroNormaRaw.split('/')[1];
      if (yearPart?.length === 4) anioSancion = yearPart;
      if (!anioSancion && yearPart?.length === 2) anioSancion = yearPart.startsWith('9') ? `19${yearPart}` : `20${yearPart}`;
    }

    const fallbackTextByTipo = (tipoInfo.tipoNorma || '') === '1' ? 'ley' : (tipoInfo.tipoNorma || '') === '2' ? 'decreto' : (tipoInfo.tipoNorma || '') === '3' ? 'resolucion' : '';
    const ensuredText = textQuery || (numeroNorma ? '' : fallbackTextByTipo);

    return {
      tipoNorma: tipoInfo.tipoNorma || undefined,
      numero: numeroNorma || undefined,
      anioSancion: anioSancion || undefined,
      texto: ensuredText || undefined,
      preferredTitleToken: tipoInfo.preferredTitleToken,
    };
  }

  private async fetchSearchPage(criteria: SearchCriteria, page: number): Promise<ParsedSearchPage> {
    const params = new URLSearchParams();
    params.set('tipoNorma', criteria.tipoNorma || '');
    params.set('numero', criteria.numero || '');
    params.set('anioSancion', criteria.anioSancion || '');
    params.set('texto', criteria.texto || '');
    params.set('dependencia', '');
    params.set('diaPubDesde', '');
    params.set('mesPubDesde', '0');
    params.set('anioPubDesde', '');
    params.set('diaPubHasta', '');
    params.set('mesPubHasta', '0');
    params.set('anioPubHasta', '');

    if (page > 1) {
      params.set('desplazamiento', 'AP');
      params.set('irAPagina', String(page));
    }

    const response = await this.requestHtml('/buscarNormas.do', {
      method: 'POST',
      data: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.status >= 400) {
      throw new HttpError(502, 'infoleg_search_error', `Infoleg devolviÃ³ ${response.status} en buscarNormas`);
    }

    return this.parseSearchHtml(response.html);
  }

  private parseSearchHtml(html: string): ParsedSearchPage {
    const $ = load(html);
    const fullText = collapseWhitespace($.root().text());

    const totalMatch = fullText.match(/Cantidad de Normas Encontradas:\s*([\d.]+)/i);
    const pagesMatch = fullText.match(/en\s+([\d.]+)\s+p[aÃ¡]gina/i);
    const total = totalMatch ? parseFirstNumber(totalMatch[1]) : 0;
    const totalPages = pagesMatch ? Math.max(1, parseFirstNumber(pagesMatch[1])) : 1;

    const hits: SaijSearchHit[] = [];
    const seen = new Set<string>();

    $('table tr').each((_, row) => {
      const link = $(row).find('a[href*="verNorma.do"][href*="id="]').first();
      if (!link.length) return;

      const href = link.attr('href');
      const id = parseInfolegId(href || '');
      if (!id || seen.has(id)) return;
      seen.add(id);

      const columns = $(row).find('td');
      if (columns.length < 3) return;

      const firstCol = sanitizeSearchSubtitle($(columns[0]).text());
      const dateCol = collapseWhitespace($(columns[1]).text()) || null;
      const thirdCol = $(columns[2]);
      const title = sanitizeSearchTitle(thirdCol.find('b').first().text()) || sanitizeSearchTitle(link.text()) || `Norma ${id}`;
      const summary = collapseWhitespace(thirdCol.find('span').first().text()) || null;
      const sourceUrl = toAbsoluteInfolegUrl(href) || `${env.infolegBaseUrl}/verNorma.do?id=${id}`;

      hits.push({
        guid: `infoleg:${id}`,
        title,
        subtitle: firstCol || null,
        summary,
        contentType: 'legislacion',
        fecha: dateCol,
        estado: null,
        jurisdiccion: 'Nacional',
        fuente: 'Infoleg',
        friendlyUrl: sourceUrl,
        sourceUrl,
        friendlyUrlParts: {
          raw: { source: 'infoleg', id },
          subdomain: 'servicios.infoleg.gob.ar',
          description: `verNorma.do?id=${id}`,
        },
      });
    });

    return {
      total,
      totalPages,
      hits,
    };
  }

  private async requestHtml(
    pathOrUrl: string,
    options: { method: 'GET' | 'POST'; data?: string; headers?: Record<string, string>; absolute?: boolean }
  ) {
    const relative = pathOrUrl.replace(/^\/+/, '');
    const target = options.absolute ? pathOrUrl : `${env.infolegBaseUrl}/${relative}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.infolegTimeoutMs);
    try {
      const response = await fetch(target, {
        method: options.method,
        body: options.method === 'POST' ? options.data : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(options.headers || {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const html = decodeResponseBody(buffer, response.headers.get('content-type') || '');
      const finalUrl = response.url || target;

      return {
        status: response.status,
        html,
        finalUrl,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new HttpError(504, 'infoleg_timeout', 'Infoleg no respondiÃ³ a tiempo');
      }
      throw new HttpError(502, 'infoleg_network_error', 'Error de red consultando Infoleg', {
        message: String(error?.message || error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const infolegService = new InfolegService();

