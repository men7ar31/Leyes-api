import { api } from "./api";
import type { ProvincialCodeCatalogEntry } from "../constants/provincialCodesCatalog";
import type { SaijDocumentResponse, SaijSearchHit, SaijSearchRequest, SaijSearchResponse } from "../types/saij";

export const searchSaij = (payload: SaijSearchRequest) => api.post<SaijSearchResponse>("/api/saij/search", payload);

export const getSaijDocument = (guid: string) =>
  api.get<SaijDocumentResponse>(`/api/saij/document/${encodeURIComponent(guid)}`);

const SAIJ_BASE_URL = "https://www.saij.gob.ar";
const DIRECT_PROVINCIAL_FACET =
  "Total|Tipo de Documento/Legislaci\u00F3n|Fecha|Organismo|Publicaci\u00F3n|Tema|Estado de Vigencia|Autor|Jurisdicci\u00F3n/Local";
const MODIFICATION_MARKERS = [
  "modific",
  "se modifica",
  "se modifican",
  "incorporacion",
  "incorpora",
  "implementacion",
  "reforma",
  "ratifica",
  "adhiere",
];

const PROVINCE_QUERY_LABELS: Record<string, string> = {
  "Ciudad Autonoma de Buenos Aires": "Ciudad Aut\u00F3noma de Buenos Aires",
  Cordoba: "C\u00F3rdoba",
  "Entre Rios": "Entre R\u00EDos",
  Neuquen: "Neuqu\u00E9n",
  "Rio Negro": "R\u00EDo Negro",
  Tucuman: "Tucum\u00E1n",
};

const PROVINCE_MATCH_ALIASES: Record<string, string[]> = {
  "Ciudad Autonoma de Buenos Aires": ["caba", "ciudad autonoma de buenos aires", "ciudad de buenos aires"],
  Cordoba: ["cordoba"],
  Tucuman: ["tucuman"],
  "Entre Rios": ["entre rios"],
  Misiones: ["misiones"],
  Neuquen: ["neuquen"],
  "Rio Negro": ["rio negro"],
};

const normalizeLoose = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCompact = (value: string) =>
  normalizeLoose(value)
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeProvinceForDirectQuery = (province: string) => {
  const normalized = normalizeLoose(province);
  if (!normalized) return "";
  if (normalized === "ciudad autonoma de buenos aires" || normalized === "caba") {
    return "ciudad autonoma de buenos aires";
  }
  return normalized;
};

const getProvinceQueryLabel = (province: string) => PROVINCE_QUERY_LABELS[province] || province;

const buildProvinceTokens = (province: string) => {
  const canonical = normalizeLoose(getProvinceQueryLabel(province));
  const input = normalizeLoose(province);
  const aliases = (PROVINCE_MATCH_ALIASES[province] || []).map((alias) => normalizeLoose(alias));
  return Array.from(new Set([canonical, input, ...aliases].filter(Boolean)));
};

const isModificationLike = (text: string) => MODIFICATION_MARKERS.some((marker) => normalizeLoose(text).includes(marker));

const isLikelyCodeDocument = (title: string, tipoNorma: string) => {
  const t = normalizeLoose(title);
  const tipo = normalizeLoose(tipoNorma);
  if (!t && !tipo) return false;
  if (!t.includes("codigo") && !tipo.includes("codigo")) return false;
  if (isModificationLike(t)) return false;
  return t.startsWith("codigo") || tipo.includes("codigo");
};

const safeParseJson = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const dedupeHitsByGuid = (hits: SaijSearchHit[]) => {
  const dedupByGuid = new Map<string, SaijSearchHit>();
  for (const hit of hits) {
    const guid = String(hit.guid || "").trim();
    if (!guid || dedupByGuid.has(guid)) continue;
    dedupByGuid.set(guid, hit);
  }
  return Array.from(dedupByGuid.values());
};

const getNumericToken = (value?: string) => String(value || "").replace(/[^\d]/g, "");

const buildEntryNumberTokens = (entry: ProvincialCodeCatalogEntry) => {
  const tokens = new Set<string>();
  const addToken = (raw?: string) => {
    const normalized = normalizeCompact(String(raw || ""));
    if (normalized) tokens.add(normalized);
    const onlyDigits = getNumericToken(normalized);
    if (onlyDigits) tokens.add(onlyDigits);
  };

  addToken(entry.numeroNorma);
  addToken(entry.reference);
  return Array.from(tokens);
};

const getAreaTokens = (area: string, searchTerms?: string[]) => {
  const stopWords = new Set(["de", "del", "la", "las", "el", "los", "y", "en"]);
  const baseWords = normalizeCompact(area).split(" ");
  const tokens = [...baseWords];
  (searchTerms || []).forEach((term) => {
    normalizeCompact(term)
      .split(" ")
      .forEach((token) => tokens.push(token));
  });
  return Array.from(new Set(tokens.filter((token) => token.length > 2 && !stopWords.has(token))));
};

const mapDirectSaijDocToHit = (doc: any): SaijSearchHit | null => {
  const abstractRaw = typeof doc?.documentAbstract === "string" ? doc.documentAbstract : "";
  if (!abstractRaw) return null;
  const parsed = safeParseJson(abstractRaw);
  const metadata = parsed?.document?.metadata || {};
  const content = parsed?.document?.content || {};

  const guid = String(metadata?.uuid || "").trim();
  const title = String(content?.["titulo-norma"] || "").trim();
  const tipoNorma = String(content?.["tipo-norma"]?.texto || "").trim();
  const provincia = String(content?.provincia || "").trim();

  if (!guid || !title) return null;
  if (!isLikelyCodeDocument(title, tipoNorma)) return null;

  const sourceUrl =
    typeof metadata?.["friendly-url"]?.subdomain === "string" &&
    typeof metadata?.["friendly-url"]?.description === "string"
      ? `${SAIJ_BASE_URL}/${metadata["friendly-url"].subdomain}-${metadata["friendly-url"].description}`
      : null;

  return {
    guid,
    title,
    subtitle: tipoNorma || null,
    summary: typeof content?.sumario === "string" ? content.sumario : null,
    contentType: "legislacion",
    fecha: typeof content?.fecha === "string" ? content.fecha : null,
    estado: typeof content?.estado === "string" ? content.estado : null,
    jurisdiccion: provincia || "Provincial",
    fuente: "SAIJ",
    friendlyUrl: sourceUrl,
    sourceUrl,
  };
};

const fetchDirectSaijByRawQuery = async (rawQuery: string, pageSize = 160): Promise<SaijSearchHit[]> => {
  const query = String(rawQuery || "").trim();
  if (!query) return [];

  const params = new URLSearchParams();
  params.set("r", query);
  params.set("o", "0");
  params.set("p", String(pageSize));
  params.set("f", DIRECT_PROVINCIAL_FACET);
  params.set("s", "");
  params.set("v", "colapsada");

  const response = await fetch(`${SAIJ_BASE_URL}/busqueda?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`SAIJ direct search failed (${response.status})`);
  }

  const rawData = await response.json();
  const docs = Array.isArray(rawData?.searchResults?.documentResultList)
    ? rawData.searchResults.documentResultList
    : [];

  const hits = docs
    .map((doc: any) => mapDirectSaijDocToHit(doc))
    .filter((hit: SaijSearchHit | null): hit is SaijSearchHit => Boolean(hit));

  return dedupeHitsByGuid(hits);
};

const scoreProvincialCandidate = (
  hit: SaijSearchHit,
  provinceTokens: string[],
  entry: ProvincialCodeCatalogEntry
) => {
  const title = String(hit.title || "");
  const subtitle = String(hit.subtitle || "");
  const summary = String(hit.summary || "");
  const jurisdiction = String(hit.jurisdiccion || "");
  const haystack = normalizeCompact(`${title} ${subtitle} ${summary} ${jurisdiction}`);
  const titleNorm = normalizeLoose(title);

  if (isModificationLike(`${title} ${subtitle}`)) return -1000;

  let score = 0;
  if (haystack.includes("codigo")) score += 30;
  if (titleNorm.startsWith("codigo")) score += 20;
  if (normalizeLoose(subtitle).includes("codigo")) score += 10;

  const provinceMatched = provinceTokens.some((token) => haystack.includes(token));
  score += provinceMatched ? 110 : -45;

  const numberTokens = buildEntryNumberTokens(entry);
  if (numberTokens.length > 0) {
    const matchedNumbers = numberTokens.filter((token) => haystack.includes(token));
    if (matchedNumbers.length > 0) score += 130 + matchedNumbers.length * 15;
  }

  const areaTokens = getAreaTokens(entry.area, entry.searchTerms);
  if (areaTokens.length > 0) {
    const matchedAreaTokens = areaTokens.filter((token) => haystack.includes(token)).length;
    score += matchedAreaTokens * 12;
  }

  return score;
};

const MIN_ACCEPTABLE_PROVINCIAL_SCORE = 30;
const EARLY_ACCEPT_PROVINCIAL_SCORE = 180;

type ProvincialCandidatePhase = "narrow" | "broad";

const rankProvincialCandidates = (
  candidates: SaijSearchHit[],
  provinceTokens: string[],
  entry: ProvincialCodeCatalogEntry
) =>
  candidates
    .map((hit) => ({ hit, score: scoreProvincialCandidate(hit, provinceTokens, entry) }))
    .sort((a, b) => b.score - a.score);

const searchProvincialCandidates = async (
  province: string,
  entry: ProvincialCodeCatalogEntry,
  phase: ProvincialCandidatePhase
): Promise<SaijSearchHit[]> => {
  const provinceQueryLabel = getProvinceQueryLabel(province);
  const provinceTermDirect = normalizeProvinceForDirectQuery(province);
  const numberToken = getNumericToken(entry.numeroNorma || entry.reference);
  const fallbackTextTerms = [provinceQueryLabel, entry.area, entry.reference, ...(entry.searchTerms || [])]
    .filter(Boolean)
    .join(" ");

  const tasks: Array<Promise<SaijSearchHit[]>> = [];
  const addSearch = (filters: SaijSearchRequest["filters"], pageSize = 25) => {
    tasks.push(
      searchSaij({
        contentType: "legislacion",
        filters,
        offset: 0,
        pageSize,
      })
        .then((response) => (Array.isArray(response.hits) ? response.hits : []))
        .catch(() => [])
    );
  };

  const addDirect = (rawQuery: string, pageSize = 160) => {
    tasks.push(
      fetchDirectSaijByRawQuery(rawQuery, pageSize).catch(() => [])
    );
  };

  if (phase === "narrow") {
    if (entry.numeroNorma) {
      addSearch(
        {
          numeroNorma: entry.numeroNorma,
          jurisdiccion: { kind: "provincial", provincia: provinceQueryLabel },
        },
        22
      );
      addSearch(
        {
          numeroNorma: entry.numeroNorma,
        },
        22
      );
    }

    if (numberToken) {
      addSearch(
        {
          numeroNorma: numberToken,
          jurisdiccion: { kind: "provincial", provincia: provinceQueryLabel },
        },
        22
      );
      addSearch(
        {
          numeroNorma: numberToken,
        },
        22
      );
      addDirect(`numero-norma:${numberToken}`, 90);
      if (provinceTermDirect) addDirect(`numero-norma:${numberToken} ${provinceTermDirect}`, 90);
    }
  } else {
    addSearch(
      {
        textoEnNorma: `codigo ${fallbackTextTerms}`.trim(),
        jurisdiccion: { kind: "provincial", provincia: provinceQueryLabel },
      },
      28
    );
    addSearch(
      {
        textoEnNorma: `codigo ${fallbackTextTerms}`.trim(),
      },
      28
    );
    if (provinceTermDirect) addDirect(`titulo:codigo ${provinceTermDirect} ${normalizeCompact(entry.area)}`, 110);
    if (provinceTermDirect) addDirect(`titulo:codigo ${provinceTermDirect}`, 120);
  }

  const resolved = await Promise.allSettled(tasks);
  const hits: SaijSearchHit[] = [];
  for (const result of resolved) {
    if (result.status !== "fulfilled") continue;
    if (!Array.isArray(result.value) || result.value.length === 0) continue;
    hits.push(...result.value);
  }
  return dedupeHitsByGuid(hits);
};

export const resolveProvincialCode = async (
  province: string,
  entry: ProvincialCodeCatalogEntry
): Promise<SaijSearchHit | null> => {
  const provinceTokens = buildProvinceTokens(province);
  const narrowCandidates = await searchProvincialCandidates(province, entry, "narrow");
  if (narrowCandidates.length > 0) {
    const bestNarrow = rankProvincialCandidates(narrowCandidates, provinceTokens, entry)[0];
    if (bestNarrow && bestNarrow.score >= EARLY_ACCEPT_PROVINCIAL_SCORE) return bestNarrow.hit;
  }

  const broadCandidates = await searchProvincialCandidates(province, entry, "broad");
  const candidates = dedupeHitsByGuid([...narrowCandidates, ...broadCandidates]);
  if (!candidates.length) return null;

  const best = rankProvincialCandidates(candidates, provinceTokens, entry)[0];
  if (!best || best.score < MIN_ACCEPTABLE_PROVINCIAL_SCORE) return null;
  return best.hit;
};

export const getProvincialCodesDirect = async (province: string): Promise<SaijSearchHit[]> => {
  const provinceTerm = normalizeProvinceForDirectQuery(province);
  if (!provinceTerm) return [];
  const provinceTokens = buildProvinceTokens(province);

  const hits = await fetchDirectSaijByRawQuery(`titulo:codigo ${provinceTerm}`, 160);
  const filtered = hits.filter((hit) => {
    const haystack = normalizeLoose(
      `${String(hit.title || "")} ${String(hit.subtitle || "")} ${String(hit.summary || "")} ${String(hit.jurisdiccion || "")}`
    );
    return provinceTokens.some((token) => haystack.includes(token));
  });
  return dedupeHitsByGuid(filtered).sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), "es")
  );
};

export const getAllProvincialBaseCodes = async (): Promise<SaijSearchHit[]> => {
  const pageSize = 20;
  const maxPages = 12;
  const merged: SaijSearchHit[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await searchSaij({
      contentType: "legislacion",
      filters: {
        tipoNorma: "codigo_provincial",
      },
      offset,
      pageSize,
    });

    if (!response?.ok || !Array.isArray(response.hits) || response.hits.length < 1) break;
    merged.push(...response.hits);
    offset += pageSize;

    const total = Number(response.total || 0);
    if (total > 0 && merged.length >= total) break;
  }

  const byGuid = new Map<string, SaijSearchHit>();
  for (const hit of merged) {
    const guid = String(hit?.guid || "").trim();
    const title = normalizeLoose(String(hit?.title || ""));
    if (!guid) continue;
    if (!title.includes("codigo")) continue;
    if (!byGuid.has(guid)) byGuid.set(guid, hit);
  }

  return Array.from(byGuid.values()).sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), "es")
  );
};
