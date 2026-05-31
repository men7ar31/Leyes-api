import axios from 'axios';
import { load } from 'cheerio';
import { HttpError } from '../../utils/httpError';

const BRAVE_SEARCH_BASE = 'https://search.brave.com/search';
const ARG_BASE_URL = 'https://www.argentina.gob.ar';
const ARG_NORMATIVA_PROVINCIAL_INDEX_URL = 'https://www.argentina.gob.ar/normativa/codigos/provinciales';
const ARG_NORMATIVA_ADVANCED_SEARCH_URL = 'https://www.argentina.gob.ar/normativa/busqueda-avanzada';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const INDEX_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SEARCH_RETRY_DELAYS_MS = [1200, 2800];

type ProvincialCodeLookupInput = {
  province: string;
  area: string;
  reference: string;
  numeroNorma?: string;
};

type ProvincialCodeDocument = {
  title: string;
  sourceUrl: string;
  contentText: string;
  fetchedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: ProvincialCodeDocument;
};

type ProvincialIndexItem = {
  provinceLabel: string;
  provinceSlug: string;
  areaLabel: string;
  sourceUrl: string;
  numberHint: string | null;
};

type ProvincialIndexCache = {
  expiresAt: number;
  items: ProvincialIndexItem[];
};

const collapseWhitespace = (value?: string | null) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

const normalizeLoose = (value?: string | null) =>
  collapseWhitespace(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSlug = (value?: string | null) =>
  normalizeLoose(value)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeNumberToken = (value?: string | null) =>
  collapseWhitespace(value)
    .toLowerCase()
    .replace(/[^\d/.-]/g, '')
    .replace(/\.+/g, '.')
    .replace(/\s+/g, '')
    .trim();

const normalizeProvinceAlias = (value?: string | null) => {
  const n = normalizeLoose(value);
  if (!n) return '';
  if (n === 'caba' || n.includes('ciudad autonoma de buenos aires') || n.includes('capital federal')) return 'caba';
  if (n.includes('tierra del fuego')) return 'tierra-del-fuego';
  if (n.includes('rio negro')) return 'rio-negro';
  if (n.includes('entre rios')) return 'entre-rios';
  if (n.includes('santiago del estero')) return 'santiago-del-estero';
  if (n.includes('san luis')) return 'san-luis';
  if (n.includes('san juan')) return 'san-juan';
  if (n.includes('santa fe')) return 'santa-fe';
  if (n.includes('santa cruz')) return 'santa-cruz';
  if (n.includes('la pampa')) return 'la-pampa';
  if (n.includes('la rioja')) return 'la-rioja';
  if (n.includes('buenos aires')) return 'buenos-aires';
  return normalizeSlug(n);
};

const getNormativaProvinceParam = (province: string) => {
  const alias = normalizeProvinceAlias(province);
  const map: Record<string, string> = {
    'buenos-aires': 'Buenos Aires',
    catamarca: 'Catamarca',
    caba: 'Ciudad Autónoma de Buenos Aires',
    chaco: 'Chaco',
    chubut: 'Chubut',
    corrientes: 'Corrientes',
    cordoba: 'Córdoba',
    'entre-rios': 'Entre Ríos',
    formosa: 'Formosa',
    jujuy: 'Jujuy',
    'la-pampa': 'La Pampa',
    'la-rioja': 'La Rioja',
    mendoza: 'Mendoza',
    misiones: 'Misiones',
    neuquen: 'Neuquén',
    'rio-negro': 'Río Negro',
    salta: 'Salta',
    'san-juan': 'San Juan',
    'san-luis': 'San Luis',
    'santa-cruz': 'Santa Cruz',
    'santa-fe': 'Santa Fe',
    'santiago-del-estero': 'Santiago del Estero',
    'tierra-del-fuego': 'Tierra del Fuego',
    tucuman: 'Tucumán',
  };
  return map[alias] || collapseWhitespace(province);
};

const getNormativaTypeParam = (input: ProvincialCodeLookupInput) => {
  const ref = normalizeLoose(input.reference);
  const area = normalizeLoose(input.area);
  if (/(decreto[\s_-]*ley|decreto\/ley)/i.test(ref) || /(decreto[\s_-]*ley|decreto\/ley)/i.test(area)) return 'decretos_ley';
  if (/decreto\b/i.test(ref) || /decreto\b/i.test(area)) return 'decretos';
  return 'leyes';
};

const extractCandidateNumberTokens = (input: ProvincialCodeLookupInput) => {
  const tokens = new Set<string>();
  const fromNumero = normalizeNumberToken(input.numeroNorma);
  if (fromNumero) tokens.add(fromNumero);
  const fromRefMatch = String(input.reference || '').match(/\d{2,7}(?:[./-]\d{2,4})?/g) || [];
  for (const raw of fromRefMatch) {
    const token = normalizeNumberToken(raw);
    if (token) tokens.add(token);
  }
  return Array.from(tokens);
};

const getSearchQueries = (input: ProvincialCodeLookupInput) => {
  const normalizedProvince = normalizeLoose(input.province);
  const numberToken = normalizeNumberToken(input.numeroNorma);
  const base = [`site:argentina.gob.ar/normativa/provincial`, input.area, input.reference, input.province]
    .filter(Boolean)
    .join(' ');
  const queries = [base, `${base} actualizacion`];
  if (numberToken) {
    queries.unshift(`site:argentina.gob.ar/normativa/provincial ley ${numberToken} ${normalizedProvince} actualizacion`);
    queries.unshift(`site:argentina.gob.ar/normativa/provincial ley ${numberToken} ${normalizedProvince}`);
  }
  return Array.from(new Set(queries.map((q) => collapseWhitespace(q)).filter(Boolean)));
};

const scoreNormativeUrl = (candidateUrl: string, input: ProvincialCodeLookupInput, numberTokens: string[]) => {
  const urlNorm = normalizeLoose(candidateUrl);
  let score = 0;
  if (urlNorm.includes('/normativa/provincial/')) score += 40;
  if (urlNorm.includes('/actualizacion')) score += 50;
  if (urlNorm.includes('/ley-')) score += 25;
  if (urlNorm.includes('/decreto-ley-') || urlNorm.includes('/decreto_ley-')) score += 20;
  if (urlNorm.includes(normalizeLoose(input.province).replace(/\s+/g, '-'))) score += 20;

  for (const token of numberTokens) {
    const compact = token.replace(/[^\d]/g, '');
    if (compact && urlNorm.includes(`ley-${compact}`)) score += 45;
    if (compact && urlNorm.includes(compact)) score += 10;
  }
  return score;
};

const toActualizacionUrl = (url: string) => (url.endsWith('/actualizacion') ? url : `${url.replace(/\/+$/, '')}/actualizacion`);

const normalizeNormativeUrl = (url: string) => {
  const trimmed = collapseWhitespace(url)
    .replace(/^blank:\s*#\s*/i, '')
    .replace(/[)>.,;]+$/, '')
    .trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${ARG_BASE_URL}${trimmed}`;
  return '';
};

const extractNumberFromNormativeUrl = (url: string) => {
  const clean = normalizeLoose(url);
  const match = clean.match(/\/(?:ley|decreto[_-]ley)-([^/]+)/);
  if (!match || !match[1]) return null;
  const raw = match[1];
  const firstToken = raw.split('-')[0] || raw;
  const numberCandidate = normalizeNumberToken(firstToken) || normalizeNumberToken(raw);
  return numberCandidate || null;
};

const hasNumberSimilarity = (itemNumberRaw: string | null | undefined, numberTokens: string[]) => {
  const itemNumber = normalizeNumberToken(itemNumberRaw || '');
  if (!itemNumber) return false;
  for (const token of numberTokens) {
    const a = normalizeNumberToken(token);
    if (!a) continue;
    if (a === itemNumber) return true;
    const aCompact = a.replace(/[^\d]/g, '');
    const bCompact = itemNumber.replace(/[^\d]/g, '');
    if (!aCompact || !bCompact) continue;
    if (aCompact === bCompact || bCompact.includes(aCompact) || aCompact.includes(bCompact)) return true;
  }
  return false;
};

const scoreIndexItem = (item: ProvincialIndexItem, input: ProvincialCodeLookupInput, numberTokens: string[]) => {
  let score = 0;
  const itemProvince = normalizeProvinceAlias(item.provinceSlug || item.provinceLabel);
  const inputProvince = normalizeProvinceAlias(input.province);
  if (itemProvince && inputProvince && itemProvince === inputProvince) score += 90;

  const itemArea = normalizeLoose(item.areaLabel);
  const inputArea = normalizeLoose(input.area);
  if (itemArea && inputArea) {
    if (itemArea === inputArea) score += 50;
    else if (itemArea.includes(inputArea) || inputArea.includes(itemArea)) score += 24;
  }

  const referenceNorm = normalizeLoose(input.reference);
  if (referenceNorm) {
    if (itemArea.includes(referenceNorm)) score += 10;
    const refTokens = referenceNorm
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 10);
    for (const token of refTokens) {
      if (itemArea.includes(token)) score += 4;
    }
  }

  const itemNumber = normalizeNumberToken(item.numberHint || extractNumberFromNormativeUrl(item.sourceUrl) || '');
  for (const token of numberTokens) {
    const a = normalizeNumberToken(token);
    if (!a || !itemNumber) continue;
    if (a === itemNumber) score += 140;
    else {
      const aCompact = a.replace(/[^\d]/g, '');
      const bCompact = itemNumber.replace(/[^\d]/g, '');
      if (aCompact && bCompact && (aCompact === bCompact || bCompact.includes(aCompact) || aCompact.includes(bCompact))) {
        score += 70;
      }
    }
  }

  return score;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractNormativeText = (html: string) => {
  const $ = load(html);
  $('script,style,noscript').remove();
  $('br').replaceWith('\n');
  $('p,div,li,tr,table,h1,h2,h3,h4,h5,h6').each((_, el) => {
    $(el).append('\n');
  });

  const mainText = collapseWhitespace($('main h1').first().text()) ? $('main').text() : $.root().text();
  const rawLines = String(mainText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);

  if (rawLines.length < 1) return null;

  const idxNormativa = rawLines.findIndex((line) => /^normativa$/i.test(normalizeLoose(line)));
  const idxSecondVigente = rawLines.findIndex(
    (line, index) => index > 8 && normalizeLoose(line) === 'vigente, de alcance general'
  );
  const idxStartBody = rawLines.findIndex((line) =>
    /^(el senado|la camara|la legislatura|art[ií]culo\s*1|art\.\s*1|libro|titulo|capitulo|seccion|visto)/i.test(normalizeLoose(line))
  );

  let start = 0;
  if (idxNormativa >= 0) start = idxNormativa + 1;
  if (idxSecondVigente >= 0) start = Math.max(start, idxSecondVigente + 1);
  if (idxStartBody >= 0) start = Math.min(start > 0 ? start : idxStartBody, idxStartBody);

  const idxEnd = rawLines.findIndex(
    (line, index) =>
      index > start && (/^volver$/i.test(normalizeLoose(line)) || /^acerca de esta norma$/i.test(normalizeLoose(line)))
  );
  const end = idxEnd > start ? idxEnd : rawLines.length;
  const scoped = rawLines.slice(start, end);
  const contentText = scoped.join('\n').trim();
  if (contentText.length < 120) return null;
  return contentText.slice(0, 900000);
};

export class ProvincialCodesService {
  private readonly cache = new Map<string, CacheEntry>();
  private indexCache: ProvincialIndexCache | null = null;
  private indexLoadingPromise: Promise<ProvincialIndexItem[]> | null = null;

  async fetchDocument(input: ProvincialCodeLookupInput): Promise<ProvincialCodeDocument> {
    const normalizedInput: ProvincialCodeLookupInput = {
      province: collapseWhitespace(input.province),
      area: collapseWhitespace(input.area),
      reference: collapseWhitespace(input.reference),
      numeroNorma: collapseWhitespace(input.numeroNorma || ''),
    };

    if (!normalizedInput.province || !normalizedInput.area || !normalizedInput.reference) {
      throw new HttpError(400, 'provincial_code_invalid_input', 'Faltan datos para buscar el codigo provincial.');
    }

    const cacheKey = JSON.stringify(normalizedInput);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;

    const numberTokens = extractCandidateNumberTokens(normalizedInput);
    const candidates: string[] = [];

    const indexedCandidates = await this.findIndexedNormativeCandidates(normalizedInput, numberTokens);
    for (const url of indexedCandidates) {
      if (!candidates.includes(url)) candidates.push(url);
    }

    if (numberTokens.length > 0) {
      const advancedCandidates = await this.searchByNormativaAdvanced(normalizedInput, numberTokens);
      for (const url of advancedCandidates) {
        if (!candidates.includes(url)) candidates.push(url);
      }
    }

    if (numberTokens.length > 0) {
      const hasExactFromIndex = candidates.some((url) => hasNumberSimilarity(extractNumberFromNormativeUrl(url), numberTokens));
      if (!hasExactFromIndex) {
        const discovered = await this.discoverProvinceNumberCandidates(normalizedInput, numberTokens);
        for (const url of discovered) {
          if (!candidates.includes(url)) candidates.push(url);
        }
      }
    }

    if (candidates.length < 1) {
      const queries = getSearchQueries(normalizedInput).slice(0, 5);
      for (const query of queries) {
        const urls = await this.searchNormativeUrls(query);
        for (const url of urls) {
          if (!candidates.includes(url)) candidates.push(url);
        }
        if (candidates.length >= 8) break;
      }
    }

    if (candidates.length < 1) {
      throw new HttpError(404, 'provincial_code_not_found', 'No se encontro una fuente publica para esta norma provincial.');
    }

    const ranked = candidates
      .map((url) => ({ url: toActualizacionUrl(url), score: scoreNormativeUrl(url, normalizedInput, numberTokens) }))
      .sort((a, b) => b.score - a.score);
    const strictNumberMatch =
      numberTokens.length > 0
        ? ranked.filter((item) => hasNumberSimilarity(extractNumberFromNormativeUrl(item.url), numberTokens))
        : ranked;
    const rankedToTry = numberTokens.length > 0 ? strictNumberMatch : ranked;

    if (numberTokens.length > 0 && rankedToTry.length < 1) {
      const alternatives = ranked
        .map((item) => extractNumberFromNormativeUrl(item.url))
        .filter((value): value is string => Boolean(value))
        .slice(0, 4);
      const alternativesMsg = alternatives.length > 0 ? ` Numeros disponibles en fuente oficial: ${alternatives.join(', ')}.` : '';
      throw new HttpError(
        404,
        'provincial_code_not_found',
        `No se encontro una fuente oficial que coincida con el numero de norma solicitado.${alternativesMsg}`
      );
    }

    let lastError: unknown = null;
    for (const item of rankedToTry.slice(0, 6)) {
      try {
        const page = await axios.get(item.url, {
          timeout: 30000,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
          validateStatus: (status) => status >= 200 && status < 400,
        });
        const contentText = extractNormativeText(String(page.data || ''));
        if (!contentText) continue;
        const title = `${normalizedInput.area} - ${normalizedInput.province}`;
        const payload: ProvincialCodeDocument = {
          title,
          sourceUrl: item.url,
          contentText,
          fetchedAt: new Date().toISOString(),
        };
        this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof HttpError) throw lastError;
    throw new HttpError(
      502,
      'provincial_code_fetch_failed',
      'No se pudo obtener el texto actualizado de la norma provincial desde fuentes publicas.'
    );
  }

  private async findIndexedNormativeCandidates(input: ProvincialCodeLookupInput, numberTokens: string[]) {
    const items = await this.loadProvincialCodesIndex();
    if (items.length < 1) return [];

    const targetProvince = normalizeProvinceAlias(input.province);
    const scoped = items.filter((item) => normalizeProvinceAlias(item.provinceSlug || item.provinceLabel) === targetProvince);
    const pool = scoped.length > 0 ? scoped : items;
    const numberMatchedPool =
      numberTokens.length > 0
        ? pool.filter((item) => hasNumberSimilarity(item.numberHint || extractNumberFromNormativeUrl(item.sourceUrl), numberTokens))
        : pool;

    const effectivePool = numberMatchedPool.length > 0 ? numberMatchedPool : pool;
    const ranked = effectivePool
      .map((item) => ({ item, score: scoreIndexItem(item, input, numberTokens) }))
      .filter((entry) => entry.score >= 45)
      .sort((a, b) => b.score - a.score);

    return ranked.map((entry) => entry.item.sourceUrl).slice(0, 8);
  }

  private async discoverProvinceNumberCandidates(input: ProvincialCodeLookupInput, numberTokens: string[]) {
    if (numberTokens.length < 1) return [];
    const items = await this.loadProvincialCodesIndex();
    if (items.length < 1) return [];

    const targetProvince = normalizeProvinceAlias(input.province);
    const seeds = Array.from(
      new Set(
        items
          .filter((item) => normalizeProvinceAlias(item.provinceSlug || item.provinceLabel) === targetProvince)
          .map((item) => item.sourceUrl.replace(/\/actualizacion$/i, ''))
      )
    ).slice(0, 14);

    const candidates: string[] = [];
    for (const seed of seeds) {
      const relatedPages = [
        `${seed}/normas-modificadas`,
        `${seed}/normas-modifican`,
        `${seed}/actualizacion`,
      ];
      for (const relatedPage of relatedPages) {
        try {
          const response = await axios.get(relatedPage, {
            timeout: 25000,
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
            validateStatus: (status) => status >= 200 && status < 500,
          });
          if (response.status >= 400) continue;
          const $ = load(String(response.data || ''));
          $('a').each((_, el) => {
            const href = normalizeNormativeUrl(String($(el).attr('href') || ''));
            if (!href) return;
            if (!/^https?:\/\/www\.argentina\.gob\.ar\/normativa\/provincial\//i.test(href)) return;
            if (!hasNumberSimilarity(extractNumberFromNormativeUrl(href), numberTokens)) return;
            if (!candidates.includes(href)) candidates.push(href);
          });
        } catch {
          // skip this related page
        }
        if (candidates.length >= 10) return candidates;
      }
    }

    return candidates;
  }

  private async searchByNormativaAdvanced(input: ProvincialCodeLookupInput, numberTokens: string[]) {
    if (numberTokens.length < 1) return [];
    const number = numberTokens[0]?.replace(/[^\d]/g, '') || '';
    if (!number) return [];

    try {
      const response = await axios.get(ARG_NORMATIVA_ADVANCED_SEARCH_URL, {
        timeout: 25000,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        params: {
          jurisdiccion: 'provincial',
          provincia: getNormativaProvinceParam(input.province),
          tipo_norma: getNormativaTypeParam(input),
          numero: number,
        },
        validateStatus: (status) => status >= 200 && status < 500,
      });
      if (response.status >= 400) return [];

      const $ = load(String(response.data || ''));
      const candidates: string[] = [];
      $('a').each((_, el) => {
        const href = normalizeNormativeUrl(String($(el).attr('href') || ''));
        if (!href) return;
        if (!/^https?:\/\/www\.argentina\.gob\.ar\/normativa\/provincial\//i.test(href)) return;
        if (!hasNumberSimilarity(extractNumberFromNormativeUrl(href), numberTokens)) return;
        if (!candidates.includes(href)) candidates.push(href);
      });
      return candidates.slice(0, 8);
    } catch {
      return [];
    }
  }

  private async loadProvincialCodesIndex() {
    if (this.indexCache && this.indexCache.expiresAt > Date.now()) return this.indexCache.items;
    if (this.indexLoadingPromise) return this.indexLoadingPromise;
    this.indexLoadingPromise = this.buildProvincialCodesIndex();
    try {
      const items = await this.indexLoadingPromise;
      this.indexCache = { items, expiresAt: Date.now() + INDEX_CACHE_TTL_MS };
      return items;
    } finally {
      this.indexLoadingPromise = null;
    }
  }

  private async buildProvincialCodesIndex() {
    const indexPage = await axios.get(ARG_NORMATIVA_PROVINCIAL_INDEX_URL, {
      timeout: 30000,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      validateStatus: (status) => status >= 200 && status < 500,
    });
    if (indexPage.status >= 400) return [];

    const $index = load(String(indexPage.data || ''));
    const provincePages = new Set<string>();
    $index('a').each((_, el) => {
      const href = String($index(el).attr('href') || '').trim();
      if (!href) return;
      if (/^\/codigos\//i.test(href) || /^\/normativa\/codigos\/(jujuy|caba)$/i.test(href)) {
        provincePages.add(href.startsWith('http') ? href : `${ARG_BASE_URL}${href}`);
      }
    });

    const indexItems: ProvincialIndexItem[] = [];
    for (const provincePageUrl of Array.from(provincePages)) {
      try {
        const page = await axios.get(provincePageUrl, {
          timeout: 30000,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
          validateStatus: (status) => status >= 200 && status < 500,
        });
        if (page.status >= 400) continue;
        const $ = load(String(page.data || ''));
        const slugMatch = provincePageUrl.match(/\/codigos\/([^/?#]+)/i);
        const provinceSlug = normalizeSlug(slugMatch?.[1] || '');
        const provinceLabel = collapseWhitespace(
          $('h1').first().text() || $('meta[property="og:title"]').attr('content') || provinceSlug
        );

        $('a').each((_, el) => {
          const rawHref = String($(el).attr('href') || '').trim();
          const sourceUrl = normalizeNormativeUrl(rawHref);
          if (!sourceUrl) return;
          if (!/^https?:\/\/www\.argentina\.gob\.ar\/normativa\/provincial\//i.test(sourceUrl)) return;
          const areaLabel = collapseWhitespace($(el).text());
          if (!areaLabel) return;
          const numberHint = extractNumberFromNormativeUrl(sourceUrl);
          indexItems.push({
            provinceLabel,
            provinceSlug,
            areaLabel,
            sourceUrl,
            numberHint,
          });
        });
      } catch {
        // continue with next province page
      }
    }

    const deduped = new Map<string, ProvincialIndexItem>();
    for (const item of indexItems) {
      const key = `${normalizeProvinceAlias(item.provinceSlug)}|${normalizeLoose(item.areaLabel)}|${normalizeLoose(item.sourceUrl)}`;
      if (!deduped.has(key)) deduped.set(key, item);
    }

    return Array.from(deduped.values());
  }

  private async searchNormativeUrls(query: string) {
    for (let attempt = 0; attempt <= SEARCH_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await axios.get(BRAVE_SEARCH_BASE, {
          params: { q: query, source: 'web' },
          timeout: 25000,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
          },
          validateStatus: (status) => status >= 200 && status < 500,
        });

        if (response.status === 429) {
          if (attempt < SEARCH_RETRY_DELAYS_MS.length) {
            await wait(SEARCH_RETRY_DELAYS_MS[attempt]);
            continue;
          }
          return [];
        }

        if (response.status >= 400) return [];

        const $ = load(String(response.data || ''));
        const urls: string[] = [];

        $('a').each((_, el) => {
          const href = normalizeNormativeUrl(String($(el).attr('href') || '').trim());
          if (!href) return;
          if (!/^https?:\/\/www\.argentina\.gob\.ar\/normativa\/provincial\//i.test(href)) return;
          if (!urls.includes(href)) urls.push(href);
        });

        return urls;
      } catch (error: any) {
        const status = Number(error?.response?.status || 0);
        if (status === 429 && attempt < SEARCH_RETRY_DELAYS_MS.length) {
          await wait(SEARCH_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        if (attempt < SEARCH_RETRY_DELAYS_MS.length) {
          await wait(SEARCH_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return [];
      }
    }

    return [];
  }
}

export const provincialCodesService = new ProvincialCodesService();

export type { ProvincialCodeLookupInput, ProvincialCodeDocument };
