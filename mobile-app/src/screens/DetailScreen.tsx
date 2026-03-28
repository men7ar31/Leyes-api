import {
  Animated,
  Alert,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ellipsis, Heart } from "lucide-react-native";
import RenderHTML from "react-native-render-html";
import { useSaijDocument } from "../hooks/useSaijDocument";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { MetadataRow } from "../components/MetadataRow";
import { ContentUnavailableCard } from "../components/ContentUnavailableCard";
import { colors, radius, spacing, typography } from "../constants/theme";
import { cleanText, formatDate } from "../utils/format";
import { sanitizeHtml } from "../utils/content";
import { searchSaij } from "../services/saijApi";
import { isFavoriteGuid, toggleFavoriteFromDocument } from "../services/favorites";
import { useAppTheme } from "../theme/appTheme";
import { getReadingBodyMetrics, readingTypography } from "../theme/readingTypography";

const TOUCH_HIT_SLOP = { top: 14, bottom: 14, left: 14, right: 14 } as const;
const SCRUBBER_THUMB_HEIGHT = 36;
const SCRUBBER_BUBBLE_HEIGHT = 48;
const SCRUBBER_TAIL_SIZE = 14;
const SCRUBBER_DRAG_TOUCH_RADIUS = 30;
const SCRUBBER_INDEX_HYSTERESIS_PX = 26;

const parseNormNumberToken = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const source = cleanText(String(value || "")).replace(/\u00A0/g, " ").trim();
  if (!source) return null;

  const fromLeyContext = source.match(
    /\bley(?:\s+n[\u00B0\u00BAo]\s*|\s+nro\.?\s*|\s+numero\s*)?([0-9][0-9.\s]{1,14}(?:\s*\/\s*\d{2,4})?)/i
  );
  const candidate = (fromLeyContext?.[1] || source).trim();
  const match = candidate.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})(?:\s*\/\s*(\d{2,4}))?/);
  if (!match || !match[1]) return null;

  const main = match[1].replace(/[.\s]/g, "");
  if (!main) return null;
  const normalizedMain = String(Number(main));
  if (!normalizedMain || normalizedMain === "NaN") return null;
  const suffix = match[2] ? `/${match[2]}` : "";
  return `${normalizedMain}${suffix}`;
};

const extractLawNumberFromText = (text?: string | null) => {
  const source = cleanText(String(text || "")).replace(/\u00A0/g, " ").trim();
  if (!source) return null;
  const match = source.match(
    /\bley(?:\s+n[\u00B0\u00BAo]\s*|\s+nro\.?\s*|\s+numero\s*)?([0-9][0-9.\s]{1,14}(?:\s*\/\s*\d{2,4})?)/i
  );
  if (!match || !match[1]) return null;
  return parseNormNumberToken(match[1]);
};

const getMetadataNormNumber = (metadata: any, textHints: Array<string | null | undefined> = []) => {
  const directKeys = [
    "numeroNorma",
    "numero_norma",
    "numero-norma",
    "nroNorma",
    "nro_norma",
    "nro-norma",
    "numeroLey",
    "numero_ley",
    "numero-ley",
    "leyNumero",
    "ley_numero",
    "ley-numero",
    "numeroSumario",
    "numero_sumario",
    "numero-sumario",
  ];

  if (metadata && typeof metadata === "object") {
    for (const key of directKeys) {
      const parsed = parseNormNumberToken((metadata as any)[key]);
      if (parsed) return parsed;
    }

    const queue: Array<{ value: any; path: string }> = [{ value: metadata, path: "" }];
    const visited = new Set<any>();
    let scanned = 0;
    while (queue.length > 0 && scanned < 260) {
      const current = queue.shift();
      if (!current) break;
      const value = current.value;
      const path = current.path;
      if (!value || typeof value !== "object") continue;
      if (visited.has(value)) continue;
      visited.add(value);

      for (const [key, entry] of Object.entries(value)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (entry && typeof entry === "object") {
          queue.push({ value: entry, path: nextPath });
          continue;
        }

        if (typeof entry === "string" || typeof entry === "number") {
          const lowerPath = nextPath.toLowerCase();
          const isNormPath =
            /(norma|ley|sumario|numero[-_ ]?(norma|ley|sumario)|nro[-_ ]?(norma|ley|sumario))/.test(lowerPath) &&
            !/(fecha|anio|ano|articulo|texto|contenido|resumen|sumilla|guid|uuid|id$)/.test(lowerPath);
          if (isNormPath) {
            const parsed = parseNormNumberToken(entry);
            if (parsed) return parsed;
          }
        }
      }
      scanned += 1;
    }
  }

  for (const hint of textHints) {
    const parsedHint = extractLawNumberFromText(hint);
    if (parsedHint) return parsedHint;
  }

  return null;
};
const getMetadataDate = (metadata: any) => {
  if (!metadata || typeof metadata !== "object") return null;
  const keys = [
    "fecha",
    "fechaPublicacion",
    "fecha_publicacion",
    "fechaSancion",
    "fecha_sancion",
    "fechaPromulgacion",
    "fecha_promulgacion",
  ];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string") return value;
  }
  return null;
};

const getMetadataStringValue = (metadata: any, keys: string[]) => {
  if (!metadata || typeof metadata !== "object") return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
};

const getPublicationDateFromMetadata = (metadata: any) =>
  getMetadataStringValue(metadata, [
    "fechaPublicacion",
    "fecha_publicacion",
    "fecha-publicacion",
    "fechaBoletin",
    "fecha_boletin",
    "fechaPublicacionBoletin",
    "fecha_publicacion_boletin",
    "fecha",
  ]);

const getLastModificationDateFromMetadata = (metadata: any) =>
  getMetadataStringValue(metadata, [
    "fechaUltimaModificacion",
    "fecha_ultima_modificacion",
    "ultimaModificacion",
    "ultima_modificacion",
    "fechaUltimaActualizacion",
    "fecha_ultima_actualizacion",
    "fechaActualizacion",
    "fecha_actualizacion",
    "ultimaReforma",
    "ultima_reforma",
    "fechaReforma",
    "fecha_reforma",
    "actualizado",
  ]);

const normalizeCitationOptionalValue = (raw?: string | null) => {
  const value = cleanText(raw);
  if (!value) return null;
  const unknownValues = new Set([
    "no informada",
    "no informado",
    "sin informacion",
    "sin informaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n",
    "desconocida",
    "desconocido",
    "s/d",
    "sd",
    "n/a",
    "na",
    "null",
    "undefined",
    "-",
    "--",
  ]);
  if (unknownValues.has(value.toLowerCase())) return null;
  const formatted = cleanText(formatDate(value) || value);
  if (!formatted || unknownValues.has(formatted.toLowerCase())) return null;
  return formatted;
};

const getContentTypeLabel = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "documento";
  if (raw.includes("legisl")) return "legislacion";
  if (raw.includes("fallo") || raw.includes("jurisprud")) return "fallo";
  if (raw.includes("sumario")) return "sumario";
  if (raw.includes("dictamen")) return "dictamen";
  if (raw.includes("doctrina")) return "doctrina";
  return raw;
};

const toSentenceCaseLabel = (value?: string | null) => {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const simplifySubtype = (value?: string | null) => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  if (lower.includes("decreto de necesidad y urgencia")) return "dnu";
  if (lower.includes("texto ordenado decreto")) return "texto ordenado decreto";
  if (lower.includes("decreto")) return "decreto";
  if (lower.includes("resoluci")) return "resolucion";
  if (lower.includes("constituci")) return "constitucion";
  if (lower.includes("codigo")) return "codigo";
  if (lower.includes("ley")) return "ley";
  if (lower.includes("sentencia")) return "sentencia";
  if (lower.includes("interlocutorio")) return "interlocutorio";
  return clean.toLowerCase();
};

const getSubtypeFromSubtitle = (subtitle?: string | null) => {
  const raw = String(subtitle || "").trim();
  if (!raw) return "";
  if (raw.includes("ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·")) {
    return raw.split("ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·")[0]?.trim() || "";
  }
  if (raw.includes(".")) {
    return raw.split(".")[0]?.trim() || "";
  }
  return raw;
};

const normalizeVigencia = (value?: string | null) => {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("vigente")) return "Vigente";
  if (lower.includes("derogad")) return "Derogada";
  if (lower.includes("modificad")) return "Modificada";
  return raw;
};

const getVigenciaColor = (value?: string | null) => {
  const normalized = normalizeVigencia(value).toLowerCase();
  if (normalized.includes("vigente")) return "#15803D";
  if (normalized.includes("derogad")) return "#111827";
  if (normalized.includes("modificad")) return "#B45309";
  return colors.text;
};


const getSubtitleText = (subtitle: unknown) => {
  if (typeof subtitle === "string") {
    const trimmed = subtitle.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (subtitle && typeof subtitle === "object" && typeof (subtitle as any).sumario === "string") {
    const trimmed = (subtitle as any).sumario.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const cleanContentText = (text?: string | null) => {
  if (!text || typeof text !== "string") return null;
  let value = text;
  value = value.replace(/\r\n/g, "\n");
  value = value.replace(/\[\[\/?p\]\]|\[\/?p\]/gi, "\n");
  value = value.replace(/\[\[\/?r[^\]]*\]\]|\[\/?r[^\]]*\]/gi, " ");
  value = value.replace(/\[\[\/?[a-z]+\]\]|\[\/?[a-z]+\]/gi, "\n");
  value = value.replace(/[ \t]+\n/g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  value = value.replace(/[ \t]{2,}/g, " ");
  return value.trim();
};

const extractRelatedContentBlock = (text?: string | null) => {
  if (!text || typeof text !== "string") {
    return { mainText: null as string | null, relatedItems: [] as string[] };
  }

  const normalized = text.replace(/\r\n/g, "\n");
  const marker = "CONTENIDO RELACIONADO";
  const markerIndex = normalized.toUpperCase().indexOf(marker);
  if (markerIndex < 0) {
    return { mainText: normalized.trim() || null, relatedItems: [] as string[] };
  }

  const before = normalized.slice(0, markerIndex).trim();
  const after = normalized.slice(markerIndex + marker.length);
  const relatedItems = after
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter((line) => line.length > 0);

  return {
    mainText: before || null,
    relatedItems: Array.from(new Set(relatedItems)),
  };
};

const parseFalloContent = (text?: string | null) => {
  if (!text || typeof text !== "string") {
    return { headerLines: [] as string[], summaryText: null as string | null };
  }
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { headerLines: [] as string[], summaryText: null as string | null };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sumarioIndex = lines.findIndex((line) => /^SUMARIO\b/i.test(line));
  if (sumarioIndex < 0) {
    return { headerLines: lines, summaryText: null };
  }

  const headerLines = lines.slice(0, sumarioIndex);
  const summaryText = lines.slice(sumarioIndex + 1).join("\n").trim() || null;
  return { headerLines, summaryText };
};

type RelatedContentItem = {
  title: string;
  subtitle?: string | null;
  contentTypeHint?:
    | "legislacion"
    | "jurisprudencia"
    | "fallo"
    | "sumario"
    | "dictamen"
    | "doctrina"
    | "todo"
    | "unknown";
  guid?: string | null;
  sourceUrl?: string | null;
  url?: string | null;
};

const dedupeRelatedByTitle = (items: RelatedContentItem[]) => {
  const parseNormIdentity = (value?: string | null) => {
    if (!value || typeof value !== "string") return "";
    const compact = value
      .replace(/[ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº]/g, " ")
      .replace(/[./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!compact) return "";
    const ley = compact.match(/\bley\b[^\d]*(\d{2,7})\b/i);
    if (ley) return `ley:${Number(ley[1])}`;
    const dnu = compact.match(/\bdnu\b[^\d]*(\d{1,7})\b/i);
    if (dnu) return `dnu:${Number(dnu[1])}`;
    const decreto = compact.match(/\bdecreto\b[^\d]*(\d{1,7})\b/i);
    if (decreto) return `decreto:${Number(decreto[1])}`;
    const resol = compact.match(/\bresoluci[oÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³]n\b[^\d]*(\d{1,7})\b/i);
    if (resol) return `resolucion:${Number(resol[1])}`;
    const rawCode = compact.match(/^(ley|dnu|dec|decreto|res|resolucion)\s+c?\s*0*(\d{1,7})\b/i);
    if (rawCode) return `${rawCode[1]}:${Number(rawCode[2])}`;
    return "";
  };

  const score = (item: RelatedContentItem) => {
    const title = String(item.title || "").trim();
    const subtitle = String(item.subtitle || "").trim();
    const guid = String(item.guid || "").trim();
    const generic = /^(ley|decreto|dnu|resoluci[oÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³]n)\b/i.test(title);
    let value = 0;
    if (guid) value += 100;
    if (!generic) value += 40;
    if (subtitle) value += 25;
    if (title.length > 28) value += 5;
    return value;
  };

  const order: string[] = [];
  const map = new Map<string, RelatedContentItem>();

  for (const item of items) {
    const title = String(item.title || "").trim();
    if (!title) continue;
    const guidKey = item.guid ? `guid:${String(item.guid).trim()}` : "";
    const normKey = parseNormIdentity(item.title) || parseNormIdentity(item.subtitle || "");
    const fallbackKey = title.toLowerCase().replace(/\s+/g, " ").trim();
    const key = guidKey || normKey || `txt:${fallbackKey}`;
    if (!map.has(key)) {
      map.set(key, item);
      order.push(key);
      continue;
    }
    const prev = map.get(key)!;
    map.set(key, score(item) > score(prev) ? item : prev);
  }

  return order.map((key) => map.get(key)!).filter(Boolean);
};

const prettifyNormLabel = (value?: string | null) => {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const ley = clean.match(/^LEY\s+C?\s+0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (ley) return `Ley ${Number(ley[1])}${ley[2] ? `/${ley[2]}` : ""}`;

  const dnu = clean.match(/^DNU\s+C?\s+0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (dnu) return `DNU ${Number(dnu[1])}${dnu[2] ? `/${dnu[2]}` : ""}`;

  const decreto = clean.match(/^DEC(?:RETO)?\s+C?\s+0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (decreto) return `Decreto ${Number(decreto[1])}${decreto[2] ? `/${decreto[2]}` : ""}`;

  const resol = clean.match(/^RES(?:OLUCION|OLUCIÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œN)?\s+C?\s+0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (resol) return `ResoluciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n ${Number(resol[1])}${resol[2] ? `/${resol[2]}` : ""}`;

  return clean;
};

const extractGuidFromUrl = (value?: string | null) => {
  if (!value || typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    const guid = parsed.searchParams.get("guid");
    return typeof guid === "string" ? guid.trim() : "";
  } catch {
    return "";
  }
};

const normalizeHeadingToken = (value?: string | null) =>
  cleanText(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isSectionHeadingLine = (value?: string | null) => /^(anexo|titulo|capitulo|seccion|libro|parte)\b/i.test(normalizeHeadingToken(value));
const isParagraphHeadingLine = (value?: string | null) => /^par(a|á)grafo\b/i.test(normalizeHeadingToken(value));
const isTitleHeadingLine = (value?: string | null) => /^titulo\b/i.test(normalizeHeadingToken(value));
const isChapterHeadingLine = (value?: string | null) => /^capitulo\b/i.test(normalizeHeadingToken(value));

const parseArticleTitleContext = (title?: string | null) => {
  if (!title || typeof title !== "string") {
    return { headings: [] as string[], articleLabel: null as string | null };
  }

  const canonicalTitle = cleanText(title)
    .replace(/\u00C2?\u00B7/g, "Â·")
    .replace(/\u2022/g, "Â·");

  const parts = canonicalTitle
    .split(/\s*(?:Â·|\|)\s*/g)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 0);

  if (!parts.length) {
    return { headings: [] as string[], articleLabel: null as string | null };
  }

  const headings = parts.filter((part) => isSectionHeadingLine(part) && !isParagraphHeadingLine(part));
  const articleParts = parts.filter((part) => !isSectionHeadingLine(part) && !isParagraphHeadingLine(part));
  const articleLabel = articleParts.length > 0 ? articleParts[articleParts.length - 1] : null;
  return { headings, articleLabel };
};

const getSafeArticleInlineLabel = (label?: string | null) => {
  const clean = cleanText(String(label || "")).replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const collapsed = clean.replace(
    /\b(?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+){2,}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\b/g,
    (chunk) => chunk.replace(/\s+/g, "")
  );

  const normalizedCollapsed = normalizeHeadingToken(collapsed);
  const normalizedNoSpace = normalizedCollapsed.replace(/\s+/g, "");

  if (/(anexo|titulo|capitulo|seccion|libro|parte|paragrafo|parrafo)/i.test(normalizedNoSpace)) return null;

  if (/(codigo)/i.test(normalizedNoSpace) && /(nacion|argentina|civil|comercial|penal|justicia)/i.test(normalizedNoSpace)) {
    return null;
  }

  const upperNoDiacritics = collapsed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "");
  if (upperNoDiacritics.length >= 20 && upperNoDiacritics === upperNoDiacritics.toUpperCase()) {
    return null;
  }

  return collapsed.trim() || null;
};
const normalizeDetachedInlineLabelCandidate = (value?: string | null) => {
  const clean = cleanText(String(value || ""))
    .replace(/^[-.:;]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;

  const firstSentence = clean.split(/[.:;]/)[0]?.trim() || "";
  const base = firstSentence.length >= 3 && firstSentence.length <= 96 ? firstSentence : clean;
  const chosen = base.replace(/[.,:;\-]+$/g, "").trim();

  if (!chosen || chosen.length < 3 || chosen.length > 120) return null;
  if (/^(?:art(?:iculo)?\.?\s*\d+)/i.test(chosen)) return null;
  return chosen;
};

const extractDetachedInlineArticleLabel = (text?: string | null) => {
  const source = String(text || "").replace(/\r\n/g, "\n").trimStart();
  if (!source) return null;
  const firstLine = source.split("\n")[0]?.trim() || "";
  if (!firstLine) return null;

  const match = firstLine.match(/^[\*"'\s]*(?:[\u00BA\u00B0\u2022\u00B7\u25E6o0])?\s*[-.:;]{1,4}\s*(.+)$/i);
  if (!match || !match[1]) return null;

  return normalizeDetachedInlineLabelCandidate(match[1]);
};

const extractLeadingSentenceArticleLabel = (text?: string | null) => {
  const source = String(text || "").replace(/\r\n/g, "\n").trimStart();
  if (!source) return null;

  const match = source.match(/^([^.\n]{3,120})\.\s+([\s\S]+)$/);
  if (!match || !match[1] || !match[2]) return null;

  const candidate = normalizeDetachedInlineLabelCandidate(match[1]);
  if (!candidate) return null;

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 10) return null;
  if (/[,:;!?]/.test(candidate)) return null;
  if (/\d/.test(candidate)) return null;

  const finiteVerbPattern = /\b(?:es|son|era|eran|fue|fueron|sera|sera\u0301|seran|sera\u0301n|debe|deben|puede|pueden|podra|podra\u0301|podran|podra\u0301n|tiene|tienen|queda|quedan|resulta|resultan|corresponde|corresponden|rige|rigen|aplica|aplican|dispone|disponen|establece|establecen|considera|consideran|entiende|entienden)\b/i;
  if (finiteVerbPattern.test(candidate)) return null;

  const remainder = String(match[2] || "").trimStart();
  if (remainder.length < 24) return null;

  return candidate;
};

const removeDetachedInlineArticleLabel = (text: string, label?: string | null) => {
  const working = String(text || "").replace(/\r\n/g, "\n").trimStart();
  const normalizedLabel = normalizeDetachedInlineLabelCandidate(label) || cleanText(String(label || "")).trim();
  if (!working || !normalizedLabel) return working.trim();

  const escaped = escapeRegExp(normalizedLabel).replace(/\s+/g, "\\s+");
  const detachedPattern = new RegExp(
    "^[\\*\"'\\s]*(?:[\\u00BA\\u00B0\\u2022\\u00B7\\u25E6o0])?\\s*[-.:;]{1,4}\\s*" +
      escaped +
      "\\s*(?:\\n+|$|[.:;\\-\\u2013\\u2014]+\\s*)",
    "i"
  );
  let next = working.replace(detachedPattern, "").trimStart();

  const firstLine = next.split("\n")[0] || "";
  const firstLineMatch = firstLine.match(/^[\*"'\s]*(?:[\u00BA\u00B0\u2022\u00B7\u25E6o0])?\s*[-.:;]{1,4}\s*(.+)$/i);
  if (firstLineMatch && firstLineMatch[1]) {
    const firstCandidate = normalizeDetachedInlineLabelCandidate(firstLineMatch[1]);
    const targetNorm = normalizeHeadingToken(normalizedLabel);
    const firstNorm = normalizeHeadingToken(firstCandidate || "");
    const sameLabel =
      !!targetNorm &&
      !!firstNorm &&
      (targetNorm === firstNorm || firstNorm.includes(targetNorm) || targetNorm.includes(firstNorm));
    if (sameLabel) {
      const inlineEscaped = escapeRegExp(firstCandidate || normalizedLabel).replace(/\s+/g, "\\s+");
      const inlinePattern = new RegExp(
        "^[\\*\"'\\s]*(?:[\\u00BA\\u00B0\\u2022\\u00B7\\u25E6o0])?\\s*[-.:;]{1,4}\\s*" +
          inlineEscaped +
          "\\s*[.:;\\-\\u2013\\u2014]*\\s*",
        "i"
      );
      const inlineNext = next.replace(inlinePattern, "").trimStart();
      if (inlineNext.length < next.length) next = inlineNext;
    }
  }

  const repeatedLabelPattern = new RegExp(
    "^[\\*\"'\\s]*" + escaped + "\\s*(?:[.:;\\-\\u2013\\u2014]+\\s*)",
    "i"
  );
  const deduped = next.replace(repeatedLabelPattern, "").trimStart();
  if (deduped.length < next.length) return deduped.trim();

  return next.trim();
};

const resolveArticleInlineLabelAndBody = (text: string, articleLabel?: string | null) => {
  const bodyBase = String(text || "").trim();
  const inlineFromTitle = getSafeArticleInlineLabel(articleLabel);
  const detached = extractDetachedInlineArticleLabel(bodyBase);
  const safeDetached = getSafeArticleInlineLabel(detached);
  const inferred = extractLeadingSentenceArticleLabel(bodyBase);
  const safeInferred = getSafeArticleInlineLabel(inferred);
  const inlineLabel = inlineFromTitle || safeDetached || safeInferred || null;

  if (!inlineLabel) {
    return { inlineLabel: null as string | null, body: bodyBase };
  }

  const labelsToClean = Array.from(new Set([inlineLabel, safeDetached, safeInferred].filter(Boolean) as string[]));
  let body = bodyBase;
  labelsToClean.forEach((candidate) => {
    body = removeDetachedInlineArticleLabel(body, candidate);
  });

  return {
    inlineLabel,
    body,
  };
};

const getNewHeadingLines = (current: string[], previous: string[]) => {
  let commonPrefix = 0;
  while (
    commonPrefix < current.length &&
    commonPrefix < previous.length &&
    current[commonPrefix].toLowerCase() === previous[commonPrefix].toLowerCase()
  ) {
    commonPrefix += 1;
  }
  return current.slice(commonPrefix);
};

const buildStickySectionLabel = (headings: string[]) => {
  if (!Array.isArray(headings) || headings.length === 0) return null;
  const title = headings.filter((line) => isTitleHeadingLine(line)).at(-1) || null;
  const chapter = headings.filter((line) => isChapterHeadingLine(line)).at(-1) || null;
  if (title && chapter) return `${cleanText(title)}\n${cleanText(chapter)}`;
  if (title) return cleanText(title);
  if (chapter) return cleanText(chapter);
  return cleanText(headings[headings.length - 1] || "");
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ARTICLE_SUFFIX_BY_CODE: Record<number, string> = {
  2: "bis",
  3: "ter",
  4: "quater",
  5: "quinquies",
  6: "sexies",
  7: "septies",
  8: "octies",
  9: "nonies",
  10: "decies",
};

const normalizeArticleNumberDisplay = (value?: string | null, fallbackIndex?: number) => {
  const raw = String(value || "").trim();
  if (!raw) return String(fallbackIndex || "");

  const compact = raw
    .replace(/\u00A0/g, " ")
    .replace(/[��]/g, "")
    .replace(/[.:;,\-��]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const annex = compact.match(/^a\s*0*(\d+)$/i);
  if (annex) return String(Number(annex[1]));

  const withCode = compact.match(/^(\d+)\s+0?(\d{1,2})$/);
  if (withCode) {
    const base = Number(withCode[1]);
    const code = Number(withCode[2]);
    const suffix = ARTICLE_SUFFIX_BY_CODE[code];
    return suffix ? `${base} ${suffix}` : String(base);
  }

  const withLiteralSuffix = compact.match(/^(\d+)\s+([a-z�������]+)$/i);
  if (withLiteralSuffix) {
    return `${Number(withLiteralSuffix[1])} ${withLiteralSuffix[2].toLowerCase()}`;
  }

  const numeric = compact.match(/^\d+$/);
  if (numeric) return String(Number(compact));
  return compact.toLowerCase();
};

const normalizeArticleSelectorToken = (value?: string | null) => {
  const withAsciiDigits = String(value || "").replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return char;
  });
  const normalized = String(value || "")
    .replace(/[^\w\s\u00C0-\u017F.,;:\-]/g, " ")
    .replace(/[_]/g, " ")
    .replace(/\./g, " ")
    .replace(/:/g, " ")
    .replace(/,/g, " ")
    .replace(/;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const normalizedSafe = withAsciiDigits
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº]/g, " ")
    .replace(/[\[\]{}()]/g, " ")
    .replace(/[^\w\s\.\,\;\:\-]/g, " ")
    .replace(/[_]/g, " ")
    .replace(/\./g, " ")
    .replace(/:/g, " ")
    .replace(/,/g, " ")
    .replace(/;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const candidate = normalizedSafe || normalized;
  if (!candidate) return "";
  const withoutPrefix = candidate.replace(/^(art(?:iculo)?\.?\s*)+/i, "").trim();
  const annex = withoutPrefix.match(/^a\s*0*(\d+)$/i);
  if (annex) return String(Number(annex[1]));
  return withoutPrefix.replace(/\s+/g, " ").trim();
};

const buildArticleShareKey = (articleIndex: number, displayNumber: string) => {
  const token = normalizeArticleSelectorToken(displayNumber);
  return `${articleIndex}:${token || cleanText(displayNumber)}`;
};

const parseArticleSelectorInput = (value: string) => {
  const rawValue = String(value || "");
  const directNumeric = rawValue.trim().match(/^\d+$/);
  if (directNumeric) {
    const normalized = normalizeArticleSelectorToken(directNumeric[0]);
    return normalized ? [{ raw: directNumeric[0], normalized }] : [];
  }
  const chunks = rawValue
    .split(/[,\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const requests: Array<{ raw: string; normalized: string }> = [];
  const pushRequest = (raw: string) => {
    const normalized = normalizeArticleSelectorToken(raw);
    if (normalized) requests.push({ raw: cleanText(raw), normalized });
  };

  for (const chunk of chunks) {
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const step = start <= end ? 1 : -1;
        const distance = Math.abs(end - start);
        if (distance <= 150) {
          for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
            pushRequest(String(current));
          }
          continue;
        }
      }
    }

    const whitespaceSplit = chunk.split(/\s+/).filter(Boolean);
    const allNumeric = whitespaceSplit.length > 1 && whitespaceSplit.every((part) => /^\d+$/.test(part));
    if (allNumeric) {
      whitespaceSplit.forEach((part) => pushRequest(part));
      continue;
    }

    pushRequest(chunk);
  }

  if (!requests.length) {
    const extracted = rawValue.match(/(?:a\s*)?\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?/gi) || [];
    extracted.forEach((token) => pushRequest(token));
  }

  const seen = new Set<string>();
  const deduped: Array<{ raw: string; normalized: string }> = [];
  for (const request of requests) {
    const key = request.normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(request);
  }
  return deduped;
};

const countMatchesInText = (text: string, query: string) => {
  const source = String(text || "");
  const needle = String(query || "").trim();
  if (!source || !needle) return 0;
  try {
    const re = new RegExp(escapeRegExp(needle), "gi");
    const matches = source.match(re);
    return Array.isArray(matches) ? matches.length : 0;
  } catch {
    return 0;
  }
};

const stripRepeatedArticleLead = (text: string, articleNumber?: string | null) => {
  let working = String(text || "").trimStart();
  if (!working) return working;

  const tryDropLeading = (pattern: RegExp) => {
    const next = working.replace(pattern, "").trimStart();
    if (!next || next === working) return false;
    // Keep protection against over-trimming when regex is too broad.
    if (next.length < Math.max(12, Math.round(working.length * 0.16))) return false;
    working = next;
    return true;
  };

  const genericPattern =
    /^[\*"'\s\u00BA\u00B0\u2022\u00B7\u25E6]*(?:art(?:i|\u00ED)culo|art\.?)\s*(?:[a-z]\s*)?\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*(?:[\u00BA\u00B0o])?\s*[.:;\-\u2013\u2014]*\s*/i;
  tryDropLeading(genericPattern);

  const rawCandidate = String(articleNumber || "")
    .replace(/[\u00BA\u00B0]/g, "")
    .replace(/[.:;,\-\u2013\u2014]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedDisplay = normalizeArticleNumberDisplay(articleNumber || "");
  const numberCandidates = Array.from(new Set([rawCandidate, normalizedDisplay].filter(Boolean)));

  for (const candidate of numberCandidates) {
    let numberPattern = "";
    const annexCandidate = candidate.match(/^a\s*0*(\d+)$/i);
    if (annexCandidate) {
      numberPattern = `a\\s*0*${Number(annexCandidate[1])}`;
    } else {
      numberPattern = escapeRegExp(candidate).replace(/\s+/g, "\\s+");
    }
    if (!numberPattern) continue;

    const exactPattern = new RegExp(
      `^[\\*"'\\s\\u00BA\\u00B0\\u2022\\u00B7\\u25E6]*(?:art(?:i|\\u00ED)culo|art\\.?)\\s*${numberPattern}\\s*(?:[\\u00BA\\u00B0o])?\\s*[.:;\\-\\u2013\\u2014]*\\s*`,
      "i"
    );
    tryDropLeading(exactPattern);

    const numericOnlyPattern = new RegExp(
      `^[\\*"'\\s\\u00BA\\u00B0\\u2022\\u00B7\\u25E6]*${numberPattern}\\s*(?:[\\u00BA\\u00B0o])?\\s*[\\.\\-\\u2013\\u2014:;]+\\s*`,
      "i"
    );
    tryDropLeading(numericOnlyPattern);
  }

  return working.trim();
};

const extractLeadTextBeforeFirstArticle = (text?: string | null) => {
  if (!text || typeof text !== "string") return null;
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;
  const match = normalized.match(/(?:^|\n)\s*(?:art(?:i|\u00ED)culo|art\.?)\s*\d+/i);
  if (!match || typeof match.index !== "number") return normalized;
  const before = normalized.slice(0, match.index).trim();
  return before.length > 0 ? before : null;
};
const getHighlightedParts = (text: string, query: string) => {
  const source = String(text || "");
  const needle = String(query || "").trim().toLowerCase();
  if (!source) return [] as Array<{ text: string; hit: boolean }>;
  if (!needle || needle.length < 2) return [{ text: source, hit: false }];

  const lower = source.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  while (cursor < source.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) {
      parts.push({ text: source.slice(cursor), hit: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: source.slice(cursor, index), hit: false });
    }
    parts.push({ text: source.slice(index, index + needle.length), hit: true });
    cursor = index + needle.length;
  }
  return parts.length ? parts : [{ text: source, hit: false }];
};

export const DetailScreen = () => {
  const { colors: appColors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ guid?: string }>();
  const guidParam = Array.isArray(params.guid) ? params.guid[0] : params.guid;

  const { document, isLoading, isError, error, refetch } = useSaijDocument(guidParam);
  const { width } = useWindowDimensions();
  const [activeSection, setActiveSection] = useState<string>("texto");
  const [expandedArticlePanels, setExpandedArticlePanels] = useState<Record<string, boolean>>({});
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [searchMatchPointer, setSearchMatchPointer] = useState(0);
  const [textZoom, setTextZoom] = useState(0.94);
  const [isDocSearchOpen, setIsDocSearchOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isMultiShareMode, setIsMultiShareMode] = useState(false);
  const [multiShareArticleInput, setMultiShareArticleInput] = useState("");
  const [selectedArticleShareKeys, setSelectedArticleShareKeys] = useState<Record<string, boolean>>({});
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteBusy, setIsFavoriteBusy] = useState(false);
  const [activeArticlePreviewIndex, setActiveArticlePreviewIndex] = useState<number>(-1);
  const [fixedHeaderHeight, setFixedHeaderHeight] = useState(0);
  const [stickySectionLabel, setStickySectionLabel] = useState<string | null>(null);
  const [isStickyIndexOpen, setIsStickyIndexOpen] = useState(false);
  const [stickyIndexEntries, setStickyIndexEntries] = useState<Array<{ y: number; label: string }>>([]);
  const [isScrubbingArticles, setIsScrubbingArticles] = useState(false);
  const [scrubberHeight, setScrubberHeight] = useState(0);
  const scrubberTrackRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const docSearchInputRef = useRef<TextInput | null>(null);
  const multiShareInputRef = useRef<TextInput | null>(null);
  const multiShareInputValueRef = useRef("");
  const scrollRafRef = useRef<number | null>(null);
  const scrubMoveRafRef = useRef<number | null>(null);
  const layoutRefreshRafRef = useRef<number | null>(null);
  const pendingScrollYRef = useRef(0);
  const pendingScrubLocationYRef = useRef<number | null>(null);
  const articleOffsetsRef = useRef<Record<number, number>>({});
  const articleOffsetSortedRef = useRef<Array<{ index: number; y: number }>>([]);
  const articleOffsetDirtyRef = useRef(true);
  const geometryTableRef = useRef<Array<{ index: number; offset: number }>>([]);
  const geometryTableDirtyRef = useRef(true);
  const articleStickyMetaRef = useRef<Record<number, { y: number; label: string | null }>>({});
  const articleStickySortedRef = useRef<Array<{ y: number; label: string }>>([]);
  const articleStickyDirtyRef = useRef(true);
  const scrollViewportHeightRef = useRef(0);
  const scrollContentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const restorePendingRef = useRef(false);
  const restoredGuidRef = useRef<string | null>(null);
  const lastDocGuidRef = useRef<string | null>(null);
  const isScrubbingArticlesRef = useRef(false);
  const scrubActiveIndexRef = useRef<number>(-1);
  const scrubberThumbTopRef = useRef(0);
  const scrubberThumbTopAnimRef = useRef(new Animated.Value(0));
  const scrubberBubbleTopAnimRef = useRef(new Animated.Value(0));
  const scrubberBubbleTailTopAnimRef = useRef(new Animated.Value((SCRUBBER_BUBBLE_HEIGHT - SCRUBBER_TAIL_SIZE) / 2));
  const scrubberBubbleOpacityRef = useRef(new Animated.Value(0));
  const scrubberDragOffsetRef = useRef(0);
  const scrubberTrackPageYRef = useRef(0);
  const scrubberTrackPageYValidRef = useRef(false);
  const stickySectionCacheRef = useRef<{ label: string | null }>({ label: null });
  const previewUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreviewIndexRef = useRef<number | null>(null);
  const previewIndexStateRef = useRef<number>(-1);
  const articleShareCacheRef = useRef<{
    source: any[] | null;
    items: Array<{
      key: string;
      index: number;
      displayNumber: string;
      articleNumberRaw: string;
      articleLeadTitle: string;
      articleBody: string;
    }>;
    keySet: Set<string>;
  }>({ source: null, items: [], keySet: new Set<string>() });
  const articleSearchCacheRef = useRef<{
    source: any[] | null;
    query: string;
    matches: number[];
    matchSet: Set<number>;
  }>({ source: null, query: "", matches: [], matchSet: new Set<number>() });
  const contentRenderCacheRef = useRef<{ key: string; node: ReactNode }>({ key: "", node: null });

  const setArticleScrubbing = (value: boolean) => {
    isScrubbingArticlesRef.current = value;
    setIsScrubbingArticles(value);
  };

  const toggleArticlePanel = (key: string) => {
    setExpandedArticlePanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setActiveSectionSafe = (nextSection: string) => {
    setArticleScrubbing(false);
    setPreviewBubbleVisible(false);
    setActiveArticlePreviewIndex(-1);
    stickySectionCacheRef.current = { label: null };
    setStickySectionLabel(null);
    setIsHeaderMenuOpen(false);
    setIsStickyIndexOpen(false);
    if (nextSection !== "texto") setIsDocSearchOpen(false);
    setActiveSection(nextSection);
  };

  const zoomOut = () => setTextZoom((prev) => Math.max(0.82, Math.round((prev - 0.06) * 100) / 100));
  const zoomIn = () => setTextZoom((prev) => Math.min(1.34, Math.round((prev + 0.06) * 100) / 100));

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      if (scrubMoveRafRef.current !== null) {
        cancelAnimationFrame(scrubMoveRafRef.current);
        scrubMoveRafRef.current = null;
      }
      if (layoutRefreshRafRef.current !== null) {
        cancelAnimationFrame(layoutRefreshRafRef.current);
        layoutRefreshRafRef.current = null;
      }
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
        previewUpdateTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsMultiShareMode(false);
    setMultiShareArticleInput("");
    setSelectedArticleShareKeys({});
    setIsStickyIndexOpen(false);
    setStickyIndexEntries([]);
    geometryTableRef.current = [];
    geometryTableDirtyRef.current = true;
    scrollOffsetRef.current = 0;
    restoredGuidRef.current = null;
    scrubActiveIndexRef.current = -1;
    previewIndexStateRef.current = -1;
    pendingPreviewIndexRef.current = null;
    if (previewUpdateTimeoutRef.current) {
      clearTimeout(previewUpdateTimeoutRef.current);
      previewUpdateTimeoutRef.current = null;
    }
    scrubberBubbleOpacityRef.current.setValue(0);
    scrubberBubbleTopAnimRef.current.setValue(0);
    scrubberBubbleTailTopAnimRef.current.setValue((SCRUBBER_BUBBLE_HEIGHT - SCRUBBER_TAIL_SIZE) / 2);
    scrubberThumbTopAnimRef.current.setValue(0);
    scrubberThumbTopRef.current = 0;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ y: 0, animated: false });
      }
    });
  }, [guidParam]);

  useEffect(() => {
    let cancelled = false;
    const loadFavoriteState = async () => {
      if (!guidParam) {
        if (!cancelled) setIsFavorite(false);
        return;
      }
      const value = await isFavoriteGuid(guidParam);
      if (!cancelled) setIsFavorite(value);
    };
    loadFavoriteState();
    return () => {
      cancelled = true;
    };
  }, [guidParam]);

  if (!guidParam) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: appColors.background }]}>
        <ErrorState message="No se encontro el documento." />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: appColors.background }]}>
        <LoadingState message="Cargando documento..." />
      </SafeAreaView>
    );
  }

  if (isError || !document) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: appColors.background }]}>
        <ErrorState message={(error as Error)?.message || "No se pudo cargar el documento."} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const attachmentUrl = document.attachment?.url || document.attachment?.fallbackUrl || null;
  const attachmentLabel = document.attachment?.fileName
    ? `Ver adjunto (${cleanText(document.attachment.fileName)})`
    : "Ver archivo adjunto";
  const normasQueModificaRaw = Array.isArray(document.normasQueModifica) ? document.normasQueModifica : [];
  const normasComplementariasRaw = Array.isArray(document.normasComplementarias) ? document.normasComplementarias : [];
  const observaciones = Array.isArray(document.observaciones) ? document.observaciones : [];
  const normasQueModifica = dedupeRelatedByTitle(normasQueModificaRaw as RelatedContentItem[]);
  const normasComplementarias = dedupeRelatedByTitle(normasComplementariasRaw as RelatedContentItem[]);
  const observacionesItems = dedupeRelatedByTitle(observaciones as RelatedContentItem[]);
  const relatedFallos = Array.isArray(document.relatedFallos) ? document.relatedFallos : [];
  const relatedContentsFromApi = Array.isArray(document.relatedContents) ? document.relatedContents : [];
  const metadataDateRaw = getMetadataDate(document.metadata);
  const metadataDate = metadataDateRaw ? formatDate(metadataDateRaw) || metadataDateRaw : null;

  const contentWidth = Math.max(0, width - spacing.md * 2);
  const clampedTextZoom = Math.max(0.82, Math.min(1.34, textZoom));
  const { fontSize: bodyFontSize, lineHeight: bodyLineHeight } = getReadingBodyMetrics(clampedTextZoom);
  const headingFontSize =
    Math.round(Math.max(bodyFontSize + 1.5, readingTypography.sectionLabelSize * clampedTextZoom + 2) * 10) / 10;
  const headingLineHeight = Math.max(22, Math.round(headingFontSize * 1.34));
  const readingBodyColor = isDarkMode ? appColors.text : readingTypography.bodyTextColor;
  const readingSecondaryColor = isDarkMode ? appColors.muted : readingTypography.secondaryTextColor;
  const readingLabelColor = isDarkMode ? appColors.primaryStrong : readingTypography.labelTextColor;
  const stickyViewportOffset = 26;
  const jumpTopOffset = spacing.md;
  const subtitleText = getSubtitleText(document.subtitle);
  const headerTitleText = (() => {
    const clean = cleanText(document.title || "").replace(/\r/g, "\n");
    const firstLine = clean
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return firstLine || clean;
  })();
  const cleanedContentText = cleanContentText(document.contentText);
  const extractedRelated =
    document.contentType === "sumario"
      ? extractRelatedContentBlock(cleanedContentText)
      : { mainText: cleanedContentText, relatedItems: [] as string[] };
  const relatedContentItems: RelatedContentItem[] =
    relatedContentsFromApi.length > 0
      ? relatedContentsFromApi
      : extractedRelated.relatedItems.map((item) => ({
          title: item,
          subtitle: null,
          contentTypeHint: "legislacion",
          guid: null,
          sourceUrl: null,
          url: null,
        }));
  const leadText = cleanContentText(document.headerText) || extractLeadTextBeforeFirstArticle(extractedRelated.mainText);
  const baseTypeLabel = getContentTypeLabel(document.contentType);
  const subtypeRaw =
    (typeof document.documentSubtype === "string" ? document.documentSubtype : null) || getSubtypeFromSubtitle(subtitleText);
  const subtypeLabel = simplifySubtype(subtypeRaw);
  const typeLabelRaw =
    subtypeLabel && subtypeLabel !== baseTypeLabel && !baseTypeLabel.includes(subtypeLabel)
      ? `${baseTypeLabel}/${subtypeLabel}`
      : baseTypeLabel;
  const typeLabel = typeLabelRaw
    .split("/")
    .map((part) => toSentenceCaseLabel(part))
    .filter(Boolean)
    .join("/ ");

  const falloParsed =
    baseTypeLabel === "fallo" ? parseFalloContent(extractedRelated.mainText) : { headerLines: [] as string[], summaryText: null as string | null };
  const falloFechaFromHeader = (() => {
    const index = falloParsed.headerLines.findIndex((line) => /^SENTENCIA$/i.test(line));
    if (index >= 0 && falloParsed.headerLines[index + 1]) return falloParsed.headerLines[index + 1];
    return null;
  })();
  const falloTribunalFromHeader =
    falloParsed.headerLines.find((line) => /CORTE|CAMARA|C[ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚ÂA]MARA|TRIBUNAL|JUZGADO/i.test(line)) || null;
  const falloFechaDisplay =
    (document.fechaSentencia ? formatDate(document.fechaSentencia) || document.fechaSentencia : null) ||
    (metadataDateRaw ? formatDate(metadataDateRaw) || metadataDateRaw : null) ||
    falloFechaFromHeader;
  const falloTribunalDisplay = (typeof document.tribunal === "string" && document.tribunal.trim()) || falloTribunalFromHeader || null;

  const doctrinaAuthorFromSubtitle = (() => {
    const subtitle = String(subtitleText || "").trim();
    if (!subtitle) return null;
    const parts = subtitle.split(".").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && /^doctrina$/i.test(parts[0])) return parts[1];
    return null;
  })();
  const autorDoctrina =
    (typeof document.autor === "string" && document.autor.trim()) || doctrinaAuthorFromSubtitle || null;
  const estadoVigencia = normalizeVigencia(
    (typeof document.estadoVigencia === "string" ? document.estadoVigencia : null) || null
  );

  const secondaryMeta =
    baseTypeLabel === "fallo"
      ? {
          label: "Sentencia / Tribunal",
          value: [falloFechaDisplay, falloTribunalDisplay].filter(Boolean).join(" ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ") || "No informado",
          color: appColors.text,
        }
      : baseTypeLabel === "doctrina"
        ? {
            label: "Autor",
            value: autorDoctrina || "No informado",
            color: appColors.text,
          }
        : baseTypeLabel === "dictamen"
          ? {
              label: "Organismo",
              value: (typeof document.organismo === "string" && document.organismo.trim()) || "No informado",
              color: appColors.text,
            }
          : baseTypeLabel === "sumario"
            ? {
                label: "Fecha",
                value: metadataDate || "No informado",
                color: appColors.text,
              }
            : {
                label: "Estado de vigencia",
                value: estadoVigencia || "No informado",
                color: estadoVigencia ? getVigenciaColor(estadoVigencia) : appColors.muted,
              };

  const sectionItems =
    document.contentType === "legislacion"
      ? [
          { key: "encabezado", label: "Encab.", count: null, visible: !!leadText },
          { key: "texto", label: "Texto", count: null, visible: true },
          { key: "normasQueModifica", label: "Modifica", count: normasQueModifica.length, visible: true },
          { key: "normasComplementarias", label: "Compl.", count: normasComplementarias.length, visible: true },
          { key: "observaciones", label: "Obs.", count: observacionesItems.length, visible: true },
        ].filter((item) => item.visible)
      : [
          { key: "texto", label: "Texto", count: null, visible: true },
          {
            key: "contenidoRelacionado",
            label: "Relacionado",
            count: relatedContentItems.length,
            visible: relatedContentItems.length > 0,
          },
          {
            key: "fallosAplica",
            label: "Fallos",
            count: relatedFallos.length,
            visible: relatedFallos.length > 0,
          },
        ].filter((item) => item.visible);
  const visibleSectionKeys = new Set(sectionItems.map((item) => item.key));
  const selectedSection = visibleSectionKeys.has(activeSection) ? activeSection : "texto";
  const searchableArticles = Array.isArray(document.articles) ? document.articles : [];
  if (articleShareCacheRef.current.source !== searchableArticles) {
    const nextItems = searchableArticles.map((article, index) => {
      const displayNumber = normalizeArticleNumberDisplay(article.number, index + 1);
      const parsedTitle = parseArticleTitleContext(article.title);
      const articleBodyRaw = stripRepeatedArticleLead(
        cleanContentText(article.text) ||
          (typeof article.text === "string" ? article.text.trim() : String(article.text ?? "")),
        article.number
      );
      const { inlineLabel: safeInlineLabel, body: articleBody } = resolveArticleInlineLabelAndBody(
        articleBodyRaw,
        parsedTitle.articleLabel
      );
      const articleLeadTitle = `ARTICULO ${displayNumber}${safeInlineLabel ? `. ${safeInlineLabel}` : "."}`;
      return {
        key: buildArticleShareKey(index, displayNumber),
        index,
        displayNumber,
        articleNumberRaw: cleanText(article.number),
        articleLeadTitle,
        articleBody,
      };
    });
    articleShareCacheRef.current = {
      source: searchableArticles,
      items: nextItems,
      keySet: new Set(nextItems.map((item) => item.key)),
    };
  }
  const articleShareItems = articleShareCacheRef.current.items;
  const articleShareKeySet = articleShareCacheRef.current.keySet;
  const selectedShareCount = Object.keys(selectedArticleShareKeys).reduce(
    (count, key) => (selectedArticleShareKeys[key] && articleShareKeySet.has(key) ? count + 1 : count),
    0
  );
  const normalizedSearchQuery = docSearchQuery.trim().toLowerCase();
  if (
    articleSearchCacheRef.current.source !== searchableArticles ||
    articleSearchCacheRef.current.query !== normalizedSearchQuery
  ) {
    let nextMatches: number[] = [];
    if (normalizedSearchQuery && searchableArticles.length) {
      nextMatches = [];
      searchableArticles.forEach((article, index) => {
        const haystack = `${article.number || ""} ${article.title || ""} ${article.text || ""}`.toLowerCase();
        if (haystack.includes(normalizedSearchQuery)) nextMatches.push(index);
      });
    }
    articleSearchCacheRef.current = {
      source: searchableArticles,
      query: normalizedSearchQuery,
      matches: nextMatches,
      matchSet: new Set(nextMatches),
    };
  }
  const articleSearchMatches = articleSearchCacheRef.current.matches;
  const articleSearchMatchSet = articleSearchCacheRef.current.matchSet;
  const plainTextSearchMatches =
    !normalizedSearchQuery || searchableArticles.length > 0
      ? 0
      : countMatchesInText(`${leadText || ""}\n${extractedRelated.mainText || ""}`, normalizedSearchQuery);
  const totalSearchMatches =
    searchableArticles.length > 0 ? articleSearchMatches.length : plainTextSearchMatches;
  const normalizedSearchPointer =
    articleSearchMatches.length > 0
      ? Math.min(searchMatchPointer, articleSearchMatches.length - 1)
      : 0;
  const activeSearchArticleIndex =
    articleSearchMatches.length > 0 ? articleSearchMatches[normalizedSearchPointer] : -1;

  const jumpToY = (y: number, animated = true, topOffset = jumpTopOffset) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ y: Math.max(0, y - topOffset), animated });
  };

  const jumpToArticleByIndex = (
    articleIndex: number,
    options?: {
      animated?: boolean;
      topOffset?: number;
    }
  ) => {
    const y = articleOffsetsRef.current[articleIndex];
    if (typeof y === "number") jumpToY(y, options?.animated ?? true, options?.topOffset ?? jumpTopOffset);
  };

  const getMaxScrollableY = () =>
    Math.max(0, scrollContentHeightRef.current - scrollViewportHeightRef.current);

  const getSortedArticleOffsets = () => {
    if (!articleOffsetDirtyRef.current) return articleOffsetSortedRef.current;
    const next = Object.entries(articleOffsetsRef.current)
      .map(([index, y]) => ({ index: Number(index), y }))
      .filter((item) => Number.isFinite(item.index) && Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);
    articleOffsetSortedRef.current = next;
    articleOffsetDirtyRef.current = false;
    return articleOffsetSortedRef.current;
  };

  const getGeometryTable = () => {
    if (searchableArticles.length < 1) return [] as Array<{ index: number; offset: number }>;
    if (!geometryTableDirtyRef.current) return geometryTableRef.current;
    geometryTableRef.current = getSortedArticleOffsets().map((entry) => ({ index: entry.index, offset: entry.y }));
    geometryTableDirtyRef.current = false;
    return geometryTableRef.current;
  };

  const exportGeometryTableJson = () =>
    JSON.stringify(
      getGeometryTable().map((item) => ({ index: item.index, offset: Math.round(item.offset) }))
    );

  const findNearestArticleIndexByY = (targetY: number) => {
    const table = getGeometryTable();
    if (!table.length) return -1;
    let lo = 0;
    let hi = table.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (table[mid].offset < targetY) lo = mid + 1;
      else hi = mid - 1;
    }
    const lower = table[Math.max(0, lo - 1)];
    const upper = table[Math.min(table.length - 1, lo)];
    if (!lower) return upper?.index ?? -1;
    if (!upper) return lower.index;
    return Math.abs(lower.offset - targetY) <= Math.abs(upper.offset - targetY) ? lower.index : upper.index;
  };

  const getTrackTravel = () => Math.max(0, scrubberHeight - SCRUBBER_THUMB_HEIGHT);
  const getThumbHalf = () => SCRUBBER_THUMB_HEIGHT / 2;

  const measureScrubberTrackWindowPosition = () => {
    const node = scrubberTrackRef.current as any;
    if (!node || typeof node.measureInWindow !== "function") return;
    node.measureInWindow((_x: number, y: number) => {
      if (Number.isFinite(y)) {
        scrubberTrackPageYRef.current = y;
        scrubberTrackPageYValidRef.current = true;
      }
    });
  };

  const getTrackYFromGestureEvent = (event: any) => {
    const pageY = event?.nativeEvent?.pageY;
    if (typeof pageY === "number" && scrubberTrackPageYValidRef.current) {
      return pageY - scrubberTrackPageYRef.current;
    }
    const locationY = event?.nativeEvent?.locationY;
    return typeof locationY === "number" ? locationY : 0;
  };

  const resolveStableNavigatorIndex = (candidateIndex: number, targetContentY: number) => {
    const current = scrubActiveIndexRef.current;
    if (current < 0 || current === candidateIndex) return candidateIndex;
    const currentOffset = articleOffsetsRef.current[current];
    const candidateOffset = articleOffsetsRef.current[candidateIndex];
    if (typeof currentOffset !== "number" || typeof candidateOffset !== "number") return candidateIndex;
    if (Math.abs(targetContentY + jumpTopOffset - currentOffset) < SCRUBBER_INDEX_HYSTERESIS_PX) return current;
    return candidateIndex;
  };

  const syncBubbleToThumb = () => {
    const thumbCenter = scrubberThumbTopRef.current + SCRUBBER_THUMB_HEIGHT / 2;
    const maxBubbleTop = Math.max(0, scrubberHeight - SCRUBBER_BUBBLE_HEIGHT);
    const bubbleTop = Math.max(0, Math.min(maxBubbleTop, thumbCenter - SCRUBBER_BUBBLE_HEIGHT / 2));
    scrubberBubbleTopAnimRef.current.setValue(bubbleTop);
    const maxTailTop = SCRUBBER_BUBBLE_HEIGHT - SCRUBBER_TAIL_SIZE - 4;
    const minTailTop = 4;
    const tailTop = Math.max(minTailTop, Math.min(maxTailTop, thumbCenter - bubbleTop - SCRUBBER_TAIL_SIZE / 2));
    scrubberBubbleTailTopAnimRef.current.setValue(tailTop);
  };

  const setThumbByRatio = (ratio: number) => {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const top = getTrackTravel() * clampedRatio;
    scrubberThumbTopRef.current = top;
    scrubberThumbTopAnimRef.current.setValue(top);
    syncBubbleToThumb();
  };

  const updateThumbByScrollY = (scrollY: number) => {
    const maxY = getMaxScrollableY();
    const ratio = maxY > 0 ? Math.max(0, Math.min(1, scrollY / maxY)) : 0;
    setThumbByRatio(ratio);
  };

  const setPreviewBubbleVisible = (visible: boolean) => {
    Animated.timing(scrubberBubbleOpacityRef.current, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 170,
      useNativeDriver: true,
    }).start();
  };

  const commitPreviewIndex = (index: number) => {
    if (previewIndexStateRef.current === index) return;
    previewIndexStateRef.current = index;
    setActiveArticlePreviewIndex(index);
  };

  const schedulePreviewIndex = (index: number, immediate = false) => {
    if (immediate) {
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
        previewUpdateTimeoutRef.current = null;
      }
      pendingPreviewIndexRef.current = null;
      commitPreviewIndex(index);
      return;
    }
    pendingPreviewIndexRef.current = index;
    if (previewUpdateTimeoutRef.current) return;
    previewUpdateTimeoutRef.current = setTimeout(() => {
      previewUpdateTimeoutRef.current = null;
      const next = pendingPreviewIndexRef.current;
      pendingPreviewIndexRef.current = null;
      if (typeof next === "number") commitPreviewIndex(next);
    }, 56);
  };

  const scheduleLayoutDerivedRefresh = () => {
    if (layoutRefreshRafRef.current !== null) return;
    layoutRefreshRafRef.current = requestAnimationFrame(() => {
      layoutRefreshRafRef.current = null;
      updateStickySectionByScroll(scrollOffsetRef.current);
      if (!isScrubbingArticlesRef.current) updateThumbByScrollY(scrollOffsetRef.current);
    });
  };

  const scrubToLocationY = (locationY: number) => {
    if (!searchableArticles.length || scrubberHeight <= 0) return;
    const half = getThumbHalf();
    const clampedCenter = Math.max(half, Math.min(locationY, Math.max(half, scrubberHeight - half)));
    const thumbTop = clampedCenter - half;
    const travel = getTrackTravel();
    const ratio = travel > 0 ? thumbTop / travel : 0;
    const maxScroll = getMaxScrollableY();
    const targetScrollY = ratio * maxScroll;
    const targetContentY = targetScrollY + jumpTopOffset;
    setThumbByRatio(ratio);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: targetScrollY, animated: false });
    }
    const nearestIndex = findNearestArticleIndexByY(targetContentY);
    const fallbackIndex = Math.max(0, Math.min(searchableArticles.length - 1, Math.round(ratio * Math.max(0, searchableArticles.length - 1))));
    const nextIndex = resolveStableNavigatorIndex(nearestIndex >= 0 ? nearestIndex : fallbackIndex, targetContentY);
    if (nextIndex !== scrubActiveIndexRef.current) {
      scrubActiveIndexRef.current = nextIndex;
      schedulePreviewIndex(nextIndex, true);
    }
  };

  const scheduleScrubToLocationY = (locationY: number) => {
    pendingScrubLocationYRef.current = locationY;
    if (scrubMoveRafRef.current !== null) return;
    scrubMoveRafRef.current = requestAnimationFrame(() => {
      scrubMoveRafRef.current = null;
      const nextY = pendingScrubLocationYRef.current;
      pendingScrubLocationYRef.current = null;
      if (typeof nextY === "number") scrubToLocationY(nextY);
    });
  };

  const goToNextSearchMatch = () => {
    if (!articleSearchMatches.length) return;
    const nextPointer = (normalizedSearchPointer + 1) % articleSearchMatches.length;
    setSearchMatchPointer(nextPointer);
    jumpToArticleByIndex(articleSearchMatches[nextPointer]);
  };

  const goToPrevSearchMatch = () => {
    if (!articleSearchMatches.length) return;
    const nextPointer =
      (normalizedSearchPointer - 1 + articleSearchMatches.length) % articleSearchMatches.length;
    setSearchMatchPointer(nextPointer);
    jumpToArticleByIndex(articleSearchMatches[nextPointer]);
  };

  if (lastDocGuidRef.current !== document.guid) {
    lastDocGuidRef.current = document.guid;
    articleOffsetsRef.current = {};
    articleOffsetSortedRef.current = [];
    articleOffsetDirtyRef.current = true;
    geometryTableRef.current = [];
    geometryTableDirtyRef.current = true;
    articleStickyMetaRef.current = {};
    articleStickySortedRef.current = [];
    articleStickyDirtyRef.current = true;
    stickySectionCacheRef.current = { label: null };
    restoredGuidRef.current = null;
    scrollOffsetRef.current = 0;
    scrubActiveIndexRef.current = -1;
    previewIndexStateRef.current = -1;
    setThumbByRatio(0);
    scrubberBubbleTopAnimRef.current.setValue(0);
    scrubberBubbleTailTopAnimRef.current.setValue((SCRUBBER_BUBBLE_HEIGHT - SCRUBBER_TAIL_SIZE) / 2);
    scrubberBubbleOpacityRef.current.setValue(0);
  }
  const safeActiveArticlePreviewIndex =
    activeArticlePreviewIndex >= 0 && activeArticlePreviewIndex < searchableArticles.length
      ? activeArticlePreviewIndex
      : -1;
  const activeArticlePreviewLabel =
    safeActiveArticlePreviewIndex >= 0
      ? `Art. ${normalizeArticleNumberDisplay(
          searchableArticles[safeActiveArticlePreviewIndex]?.number,
          safeActiveArticlePreviewIndex + 1
        )}.`
      : null;
  const activeArticlePreviewHeading =
    safeActiveArticlePreviewIndex >= 0
      ? articleStickyMetaRef.current[safeActiveArticlePreviewIndex]?.label || null
      : null;

  const getSortedStickyEntries = () => {
    if (!articleStickyDirtyRef.current) return articleStickySortedRef.current;
    const raw = Object.values(articleStickyMetaRef.current)
      .filter((item) => item && Number.isFinite(item.y) && item.label)
      .sort((a, b) => a.y - b.y) as Array<{ y: number; label: string }>;
    const compact: Array<{ y: number; label: string }> = [];
    for (const entry of raw) {
      const prev = compact[compact.length - 1];
      if (!prev || prev.label !== entry.label) compact.push(entry);
    }
    articleStickySortedRef.current = compact;
    articleStickyDirtyRef.current = false;
    return articleStickySortedRef.current;
  };

  const openStickySectionIndex = () => {
    if (selectedSection !== "texto") return;
    const entries = getSortedStickyEntries();
    if (!entries.length) return;
    setStickyIndexEntries(entries);
    setIsStickyIndexOpen(true);
  };

  const jumpToStickyEntry = (entry: { y: number; label: string }) => {
    setIsStickyIndexOpen(false);
    jumpToY(entry.y, true, jumpTopOffset);
  };

  const updateStickySectionByScroll = (scrollY: number) => {
    if (selectedSection !== "texto") {
      if (stickySectionCacheRef.current.label !== null) {
        stickySectionCacheRef.current = { label: null };
        setStickySectionLabel(null);
      }
      return;
    }

    const entries = getSortedStickyEntries();
    if (!entries.length) {
      if (stickySectionCacheRef.current.label !== null) {
        stickySectionCacheRef.current = { label: null };
        setStickySectionLabel(null);
      }
      return;
    }

    const anchorY = scrollY + stickyViewportOffset;
    let lo = 0;
    let hi = entries.length - 1;
    let currentIndex = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (entries[mid].y <= anchorY) {
        currentIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (currentIndex < 0) {
      if (stickySectionCacheRef.current.label !== null) {
        stickySectionCacheRef.current = { label: null };
        setStickySectionLabel(null);
      }
      return;
    }

    const current = entries[currentIndex];

    if (stickySectionCacheRef.current.label !== current.label) {
      stickySectionCacheRef.current.label = current.label;
      setStickySectionLabel(current.label);
    }
  };

  const renderHighlightedInline = (value: string, keyPrefix: string) =>
    getHighlightedParts(value, normalizedSearchQuery).map((part, index) => (
      <Text key={`${keyPrefix}-${index}`} style={part.hit ? styles.searchHighlight : undefined}>
        {part.text}
      </Text>
    ));

  const renderHighlightedBlock = (value: string, style: any, keyPrefix: string) => (
    <Text style={style}>{renderHighlightedInline(value, keyPrefix)}</Text>
  );

  const handleDetailScroll = (y: number) => {
    scrollOffsetRef.current = y;
    if (isScrubbingArticlesRef.current) return;
    updateThumbByScrollY(y);
    const nearestIndex = findNearestArticleIndexByY(y + jumpTopOffset);
    scrubActiveIndexRef.current = nearestIndex;
    pendingScrollYRef.current = y;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateStickySectionByScroll(pendingScrollYRef.current);
    });
  };

  const restoreSavedScrollIfNeeded = () => {
    if (!document.guid || !scrollRef.current) return;
    if (restoredGuidRef.current === document.guid) return;
    restoredGuidRef.current = document.guid;
    if (restorePendingRef.current) return;
    restorePendingRef.current = true;
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ y: 0, animated: false });
        handleDetailScroll(0);
      }
      restorePendingRef.current = false;
    }, 20);
  };

  const stopScrubbing = () => {
    if (isScrubbingArticlesRef.current) setArticleScrubbing(false);
    setPreviewBubbleVisible(false);
    schedulePreviewIndex(-1, true);
    if (scrubMoveRafRef.current !== null) {
      cancelAnimationFrame(scrubMoveRafRef.current);
      scrubMoveRafRef.current = null;
    }
    if (layoutRefreshRafRef.current !== null) {
      cancelAnimationFrame(layoutRefreshRafRef.current);
      layoutRefreshRafRef.current = null;
    }
    pendingScrubLocationYRef.current = null;
    if (scrubActiveIndexRef.current >= 0) {
      const snapOffset = articleOffsetsRef.current[scrubActiveIndexRef.current];
      if (typeof snapOffset === "number" && scrollRef.current) {
        const maxScroll = getMaxScrollableY();
        const snappedY = Math.max(0, Math.min(maxScroll, snapOffset - jumpTopOffset));
        scrollRef.current.scrollTo({ y: snappedY, animated: false });
        scrollOffsetRef.current = snappedY;
        requestAnimationFrame(() => {
          updateThumbByScrollY(snappedY);
          updateStickySectionByScroll(snappedY);
        });
      } else {
        jumpToArticleByIndex(scrubActiveIndexRef.current, { animated: false, topOffset: jumpTopOffset });
      }
    }
    scrubActiveIndexRef.current = -1;
  };

  const switchSectionBySwipe = (direction: "prev" | "next") => {
    if (sectionItems.length <= 1) return;
    const currentIndex = sectionItems.findIndex((item) => item.key === selectedSection);
    if (currentIndex < 0) return;
    const delta = direction === "next" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(sectionItems.length - 1, currentIndex + delta));
    if (nextIndex === currentIndex) return;
    const nextKey = sectionItems[nextIndex]?.key;
    if (!nextKey) return;
    setActiveSectionSafe(nextKey);
  };

  const sectionSwipeResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (sectionItems.length <= 1) return false;
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      return absDx > 28 && absDx > absDy * 2;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx <= -42) switchSectionBySwipe("next");
      else if (gestureState.dx >= 42) switchSectionBySwipe("prev");
    },
  });

  const articleScrubberResponder = PanResponder.create({
    onStartShouldSetPanResponder: () =>
      selectedSection === "texto" && searchableArticles.length > 0 && scrubberHeight > 0,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      selectedSection === "texto" && searchableArticles.length > 0 && scrubberHeight > 0 && Math.abs(gestureState.dy) > 1,
    onPanResponderGrant: (event) => {
      setArticleScrubbing(true);
      setPreviewBubbleVisible(true);
      measureScrubberTrackWindowPosition();
      const trackY = getTrackYFromGestureEvent(event);
      const thumbCenter = scrubberThumbTopRef.current + SCRUBBER_THUMB_HEIGHT / 2;
      const isNearThumb = Math.abs(trackY - thumbCenter) <= SCRUBBER_DRAG_TOUCH_RADIUS;
      scrubberDragOffsetRef.current = isNearThumb ? trackY - thumbCenter : 0;
      scheduleScrubToLocationY(trackY - scrubberDragOffsetRef.current);
    },
    onPanResponderMove: (event) => {
      if (!isScrubbingArticlesRef.current) return;
      const trackY = getTrackYFromGestureEvent(event);
      scheduleScrubToLocationY(trackY - scrubberDragOffsetRef.current);
    },
    onPanResponderRelease: () => {
      stopScrubbing();
    },
    onPanResponderTerminate: () => {
      stopScrubbing();
    },
    onPanResponderTerminationRequest: () => false,
  });

  const openRelatedFallo = async (fallo: { title: string; guid?: string | null; sourceUrl?: string | null; url?: string | null }) => {
    const directGuid = typeof fallo.guid === "string" ? fallo.guid.trim() : "";
    const fallbackGuidFromUrl = extractGuidFromUrl(fallo.sourceUrl || fallo.url || null);
    const resolvedGuid = directGuid || fallbackGuidFromUrl;
    if (resolvedGuid) {
      router.push({ pathname: "/detail/[guid]", params: { guid: resolvedGuid } });
      return;
    }

    const cleanedTitle = fallo.title
      .replace(/[^A-Za-z0-9ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â±\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const titleTokens = cleanedTitle.split(" ").filter((token) => token.length > 2);
    const attempts = Array.from(
      new Set(
        [
          fallo.title,
          cleanedTitle,
          titleTokens[0],
          titleTokens[1],
          titleTokens[0] && titleTokens[1] ? `${titleTokens[0]} ${titleTokens[1]}` : null,
        ].filter((value): value is string => Boolean(value && value.trim().length > 0))
      )
    );

    try {
      for (const term of attempts) {
        const response = await searchSaij({
          contentType: "fallo",
          filters: {
            textoEnNorma: term,
            jurisdiccion: { kind: "todas" },
          },
          offset: 0,
          pageSize: 10,
        });

        const preferred =
          response.hits.find(
            (hit) =>
              hit.contentType === "fallo" &&
              titleTokens[0] &&
              hit.title.toLowerCase().includes(titleTokens[0].toLowerCase())
          ) ||
          response.hits.find((hit) => hit.contentType === "fallo") ||
          response.hits[0];

        const resolvedGuid = typeof preferred?.guid === "string" ? preferred.guid.trim() : "";
        if (resolvedGuid) {
          router.push({ pathname: "/detail/[guid]", params: { guid: resolvedGuid } });
          return;
        }
      }
    } catch {
      // handled below
    }

    Alert.alert("No se pudo abrir el fallo", "No encontramos el fallo relacionado en SAIJ en este momento.");
  };

  const openRelatedContent = async (item: RelatedContentItem) => {
    const directGuid = typeof item.guid === "string" ? item.guid.trim() : "";
    const fallbackGuidFromUrl = extractGuidFromUrl(item.sourceUrl || item.url || null);
    const resolvedGuid = directGuid || fallbackGuidFromUrl;
    if (resolvedGuid) {
      router.push({ pathname: "/detail/[guid]", params: { guid: resolvedGuid } });
      return;
    }

    const line = item.title;
    const leyMatch = line.match(/ley\s+(\d{2,7})/i);
    const cccnMatch = line.match(/\bCCCN\b\D*(\d{1,5})/i);
    const numeroNorma = leyMatch?.[1]?.trim();
    const cleanedLine = line.replace(/\s+/g, " ").trim();
    const tokens = cleanedLine.split(" ").filter((token) => token.length > 2);
    const hint =
      item.contentTypeHint && item.contentTypeHint !== "unknown"
        ? item.contentTypeHint
        : "todo";
    const attempts = Array.from(
      new Set(
        [
          cleanedLine,
          cccnMatch?.[1] ? `Codigo Civil y Comercial de la Nacion articulo ${cccnMatch[1]}` : null,
          tokens[0],
          tokens[1],
          tokens[0] && tokens[1] ? `${tokens[0]} ${tokens[1]}` : null,
        ].filter((value): value is string => Boolean(value && value.trim().length > 0))
      )
    );

    try {
      if ((numeroNorma || cccnMatch?.[1]) && (hint === "legislacion" || hint === "todo")) {
        const numeroNormaFinal = numeroNorma || "26994";
        const byNumber = await searchSaij({
          contentType: "legislacion",
          filters: {
            numeroNorma: numeroNormaFinal,
            jurisdiccion: { kind: "todas" },
          },
          offset: 0,
          pageSize: 10,
        });
        const firstByNumber = byNumber.hits.find((hit) => hit.contentType === "legislacion") || byNumber.hits[0];
        const guidByNumber = typeof firstByNumber?.guid === "string" ? firstByNumber.guid.trim() : "";
        if (guidByNumber) {
          router.push({ pathname: "/detail/[guid]", params: { guid: guidByNumber } });
          return;
        }
      }

      const contentTypeOrder = (
        hint === "todo" ? ["todo"] : [hint, "todo"]
      ) as Array<"legislacion" | "fallo" | "sumario" | "dictamen" | "doctrina" | "todo">;

      for (const contentType of contentTypeOrder) {
        for (const term of attempts) {
          const response = await searchSaij({
            contentType,
            filters: {
              textoEnNorma: term,
              jurisdiccion: { kind: "todas" },
            },
            offset: 0,
            pageSize: 10,
          });
          const first =
            contentType !== "todo"
              ? response.hits.find((hit) => hit.contentType === contentType) || response.hits[0]
              : response.hits[0];
          const guid = typeof first?.guid === "string" ? first.guid.trim() : "";
          if (guid) {
            router.push({ pathname: "/detail/[guid]", params: { guid } });
            return;
          }
        }
      }
    } catch {
      // handled below
    }

    Alert.alert("No se pudo abrir el relacionado", "No encontramos el contenido relacionado en SAIJ en este momento.");
  };

  const citationLawName = cleanText(document.title || "Norma");
  const isLegislationCitation = getContentTypeLabel(document.contentType) === "legislacion";
  const citationLawNumber = isLegislationCitation
    ? getMetadataNormNumber(document.metadata, [document.subtitle, document.title, document.documentSubtype])
    : getMetadataNormNumber(document.metadata);
  const citationPublicationRaw = getPublicationDateFromMetadata(document.metadata);
  const citationLastModRaw = getLastModificationDateFromMetadata(document.metadata);
  const citationPublication = normalizeCitationOptionalValue(citationPublicationRaw);
  const citationLastModification = normalizeCitationOptionalValue(citationLastModRaw);
  const citationLawNumberLabel = citationLawNumber ? `Ley ${citationLawNumber}` : "Ley s/n";

  const buildCitation = (articleNumber?: string | null) => {
    const art = String(articleNumber || "").trim();
    const parts = [
      art ? `art. ${art}` : null,
      citationLawName,
      citationLawNumberLabel,
      citationPublication ? `publicacion: ${citationPublication}` : null,
      citationLastModification ? `ultima modificacion: ${citationLastModification}` : null,
    ].filter(Boolean);
    return `(${parts.join(", ")})`;
  };

  const shareTextPayload = async (title: string, message: string) => {
    try {
      await Share.share({ title, message });
    } catch {
      Alert.alert("No se pudo compartir", "No fue posible abrir el menu de compartir en este momento.");
    }
  };

  const shareLargeTextAsFile = async (title: string, content: string) => {
    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        await shareTextPayload(title, content);
        return;
      }

      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) {
        await shareTextPayload(title, content);
        return;
      }

      const safeFileName =
        cleanText(title || "norma")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Za-z0-9\-\s_]/g, " ")
          .replace(/\s+/g, "_")
          .trim()
          .slice(0, 64) || "norma";
      const fileUri = `${baseDir}${safeFileName}-${Date.now()}.txt`;

      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        dialogTitle: title,
        mimeType: "text/plain",
        UTI: "public.plain-text",
      });

      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {
        // ignore cleanup failures
      }
    } catch {
      await shareTextPayload(title, content);
    }
  };

  const shareWholeDocument = async () => {
    const heading = cleanText(document.title || "Norma");
    const citation = buildCitation();

    let body = "";
    if (document.articles && document.articles.length > 0) {
      const articleBlocks: string[] = [];
      for (let index = 0; index < document.articles.length; index += 1) {
        const article = document.articles[index];
        const displayNumber = normalizeArticleNumberDisplay(article.number, index + 1);
        const parsedTitle = parseArticleTitleContext(article.title);
        const textRaw = stripRepeatedArticleLead(
          cleanContentText(article.text) ||
            (typeof article.text === "string" ? article.text.trim() : String(article.text ?? "")),
          article.number
        );
        const { inlineLabel: safeInlineLabel, body: text } = resolveArticleInlineLabelAndBody(
          textRaw,
          parsedTitle.articleLabel
        );
        const lead = `ARTICULO ${displayNumber}${safeInlineLabel ? `. ${safeInlineLabel}` : "."}`;
        const block = `${lead}\n${text}\n${buildCitation(displayNumber)}`;
        articleBlocks.push(block);
      }
      body = articleBlocks.join("\n\n");
    } else {
      body = [leadText, extractedRelated.mainText].filter(Boolean).join("\n\n").trim();
    }

    const message = `${heading}\n\n${body}\n\n${citation}`.trim();
    await shareLargeTextAsFile(heading, message);
  };
  const shareSingleArticle = async (params: {
    displayNumber: string;
    articleLeadTitle: string;
    articleBody: string;
  }) => {
    const heading = cleanText(document.title || "Norma");
    const message = `${heading}\n\n${params.articleLeadTitle}\n${params.articleBody}\n\n${buildCitation(
      params.displayNumber
    )}`.trim();
    await shareTextPayload(`${heading} \u00B7 Art. ${params.displayNumber}`, message);
  };

  const toggleArticleSelectedForShare = (articleKey: string) => {
    setSelectedArticleShareKeys((prev) => {
      const next = { ...prev };
      if (next[articleKey]) delete next[articleKey];
      else next[articleKey] = true;
      return next;
    });
  };

  const clearMultiShareSelection = () => {
    setSelectedArticleShareKeys({});
    setMultiShareArticleInput("");
    multiShareInputValueRef.current = "";
  };

  const resolveArticleKeysByInputToken = (normalizedToken: string) => {
    const token = normalizeArticleSelectorToken(normalizedToken);
    if (!token) return [] as string[];

    const numericToken = token.match(/^(\d+)$/)?.[1] || "";
    const matches = new Set<string>();

    articleShareItems.forEach((item) => {
      const displayToken = normalizeArticleSelectorToken(item.displayNumber);
      const rawToken = normalizeArticleSelectorToken(item.articleNumberRaw);
      const aliases = [displayToken, rawToken].filter(Boolean) as string[];
      if (aliases.includes(token)) {
        matches.add(item.key);
        return;
      }
      if (numericToken) {
        for (const alias of aliases) {
          const leadingNumeric = alias.match(/^(\d+)/)?.[1] || "";
          if (
            alias === numericToken ||
            alias.startsWith(`${numericToken} `) ||
            alias.endsWith(` ${numericToken}`) ||
            leadingNumeric === numericToken
          ) {
            matches.add(item.key);
            return;
          }
        }
      }
    });

    return Array.from(matches);
  };

  const addArticlesToSelectionFromInput = (rawInput?: string) => {
    const source = String(rawInput ?? multiShareInputValueRef.current ?? multiShareArticleInput ?? "");
    const requests = parseArticleSelectorInput(source);
    if (!requests.length) {
      Alert.alert("Numeros invalidos", "Ingresa articulos separados por coma. Ejemplo: 1, 2, 10-12.");
      return;
    }

    const next = { ...selectedArticleShareKeys };
    const missing: string[] = [];
    let added = 0;
    requests.forEach((request) => {
      const keys = resolveArticleKeysByInputToken(request.normalized);
      if (!keys.length) {
        missing.push(request.raw);
        return;
      }
      keys.forEach((key) => {
        if (!next[key]) {
          next[key] = true;
          added += 1;
        }
      });
    });

    if (added === 0 && missing.length > 0) {
      Alert.alert("Sin coincidencias", `No encontramos articulos para: ${missing.slice(0, 4).join(", ")}`);
      return;
    }

    setSelectedArticleShareKeys(next);
    const remaining = missing.length > 0 ? missing.join(", ") : "";
    multiShareInputValueRef.current = remaining;
    setMultiShareArticleInput(remaining);
  };

  const shareSelectedArticles = async () => {
    const selected = articleShareItems.filter((item) => selectedArticleShareKeys[item.key]);
    if (!selected.length) {
      Alert.alert("Sin articulos seleccionados", "Selecciona articulos desde la ley o por numero para compartir.");
      return;
    }
    const heading = cleanText(document.title || "Norma");
    const body = selected
      .map(
        (item) =>
          `${item.articleLeadTitle}\n${item.articleBody}\n${buildCitation(item.displayNumber)}`
      )
      .join("\n\n");
    const message = `${heading}\n\n${body}`.trim();
    await shareTextPayload(`${heading} \u00B7 ${selected.length} articulos`, message);
  };

  const toggleFavoriteCurrentDocument = async () => {
    if (isFavoriteBusy) return;
    try {
      setIsFavoriteBusy(true);
      const result = await toggleFavoriteFromDocument(document);
      setIsFavorite(result.isFavorite);
    } catch {
      Alert.alert("No se pudo actualizar favorito", "Intenta nuevamente.");
    } finally {
      setIsFavoriteBusy(false);
    }
  };

  const toggleDocSearch = () => {
    if (selectedSection !== "texto") return;
    setIsDocSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          docSearchInputRef.current?.focus();
        }, 30);
      }
      return next;
    });
  };

  const renderContent = () => {
    if (document.hasRenderableContent === false) {
      return <ContentUnavailableCard reason={document.contentUnavailableReason} />;
    }

    const html = typeof document.contentHtml === "string" ? document.contentHtml.trim() : "";
    if (html && html.length > 200) {
      return (
        <RenderHTML
          contentWidth={contentWidth}
          source={{ html: sanitizeHtml(html) }}
          baseStyle={{ color: colors.text, fontSize: bodyFontSize, lineHeight: bodyLineHeight }}
        />
      );
    }

    if (document.articles && document.articles.length > 0) {
      let previousHeadings: string[] = [];
      return (
        <View style={styles.articles}>
          {document.articles.map((article, index) => {
            const articleText =
              cleanContentText(article.text) ||
              (typeof article.text === "string" ? article.text.trim() : String(article.text ?? ""));
            const articleTextRaw = stripRepeatedArticleLead(articleText, article.number);
            const parsedTitle = parseArticleTitleContext(article.title);
            const displayArticleNumber = normalizeArticleNumberDisplay(article.number, index + 1);
            const articleShareKey = buildArticleShareKey(index, displayArticleNumber);
            const isArticleSelectedForShare = !!selectedArticleShareKeys[articleShareKey];
            const { inlineLabel: safeInlineLabel, body: articleTextWithoutDuplicateLabel } = resolveArticleInlineLabelAndBody(
              articleTextRaw,
              parsedTitle.articleLabel
            );
            const articleLeadTitle = `ARTICULO ${displayArticleNumber}${
              safeInlineLabel ? `. ${safeInlineLabel}` : "."
            }`;
            const articleNormasQueModifica = Array.isArray(article.normasQueModifica) ? article.normasQueModifica : [];
            const articleNormasComplementarias = Array.isArray(article.normasComplementarias) ? article.normasComplementarias : [];
            const articleObservaciones = Array.isArray(article.observaciones) ? article.observaciones : [];
            const articleNormasQueModificaFinal = dedupeRelatedByTitle(articleNormasQueModifica as RelatedContentItem[]);
            const articleNormasComplementariasFinal = dedupeRelatedByTitle(articleNormasComplementarias as RelatedContentItem[]);
            const articleObservacionesFinal = dedupeRelatedByTitle(articleObservaciones as RelatedContentItem[]);
            const headingLines = getNewHeadingLines(parsedTitle.headings, previousHeadings);
            const stickyLabelForArticle = buildStickySectionLabel(parsedTitle.headings);
            previousHeadings = parsedTitle.headings;
            const articleKey = `${index}-${article.number || "na"}`;
            const articlePanels = [
              {
                key: `${articleKey}-normas-mod`,
                label: "Modifica",
                items: articleNormasQueModificaFinal,
              },
              {
                key: `${articleKey}-normas-comp`,
                label: "Compl.",
                items: articleNormasComplementariasFinal,
              },
              {
                key: `${articleKey}-obs`,
                label: "Obs.",
                items: articleObservacionesFinal,
              },
            ].filter((panel) => panel.items.length > 0);
            const isSearchHit = articleSearchMatchSet.has(index);
            const isSearchActive = activeSearchArticleIndex === index;
            return (
              <View
                key={articleKey}
                style={styles.articleBlock}
                onLayout={(event) => {
                  const y = event.nativeEvent.layout.y;
                  articleOffsetsRef.current[index] = y;
                  articleOffsetDirtyRef.current = true;
                  geometryTableDirtyRef.current = true;
                  articleStickyMetaRef.current[index] = { y, label: stickyLabelForArticle };
                  articleStickyDirtyRef.current = true;
                  scheduleLayoutDerivedRefresh();
                }}
              >
                {headingLines.map((heading, headingIndex) => (
                  <Text
                    key={`${articleKey}-h-${headingIndex}`}
                    style={[
                      styles.sectionHeading,
                      {
                        fontSize: Math.max(12.5, headingFontSize),
                        lineHeight: headingLineHeight,
                        color: readingLabelColor,
                      },
                    ]}
                  >
                    {cleanText(heading)}
                  </Text>
                ))}
                <View
                    style={[
                      styles.articleCard,
                      {
                        backgroundColor: isDarkMode ? appColors.card : readingTypography.articleCardBackground,
                        borderColor: appColors.border,
                      },
                    isSearchHit ? styles.articleCardSearchHit : null,
                    isSearchActive ? styles.articleCardSearchActive : null,
                  ]}
                >
                  <View style={styles.articleLeadRow}>
                    <Text
                      style={[
                        styles.articleLeadInline,
                        { fontSize: bodyFontSize, lineHeight: bodyLineHeight, color: readingBodyColor },
                      ]}
                    >
                      {articleLeadTitle}
                    </Text>
                    <View style={styles.articleLeadActions}>
                      <Pressable
                        style={[
                          styles.articleShareBtn,
                          isMultiShareMode && isArticleSelectedForShare ? styles.articleShareBtnActive : null,
                        ]}
                        onPress={() => {
                          if (!isMultiShareMode) {
                            setIsMultiShareMode(true);
                            setSelectedArticleShareKeys({ [articleShareKey]: true });
                            return;
                          }
                          toggleArticleSelectedForShare(articleShareKey);
                        }}
                        onLongPress={() =>
                          shareSingleArticle({
                            displayNumber: displayArticleNumber,
                            articleLeadTitle,
                            articleBody: articleTextWithoutDuplicateLabel,
                          })
                        }
                        hitSlop={TOUCH_HIT_SLOP}
                      >
                        <Text
                          style={[
                            styles.articleShareBtnText,
                            isMultiShareMode && isArticleSelectedForShare ? styles.articleShareBtnTextActive : null,
                          ]}
                        >
                          {isMultiShareMode ? (isArticleSelectedForShare ? "\u2713" : "+") : "\u2197"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.articleText,
                      { fontSize: bodyFontSize, lineHeight: bodyLineHeight, color: readingBodyColor },
                    ]}
                  >
                    {renderHighlightedInline(articleTextWithoutDuplicateLabel, `${articleKey}-body`)}
                  </Text>
                  {articlePanels.length > 0 ? (
                    <View style={styles.articlePanelContainer}>
                      {articlePanels.map((panel) => (
                        <View key={panel.key} style={styles.articlePanelBlock}>
                          <Pressable
                            style={styles.articlePanelButton}
                            onPress={() => toggleArticlePanel(panel.key)}
                            hitSlop={TOUCH_HIT_SLOP}

                          >
                            <Text style={styles.articlePanelButtonText}>
                              {panel.label} ({panel.items.length})
                            </Text>
                          </Pressable>
                          {expandedArticlePanels[panel.key] ? (
                            <View style={styles.articlePanelContent}>
                              {panel.items.map((item, itemIndex) => (
                                <Pressable
                                  key={`${panel.key}-${itemIndex}-${item.title}-${item.guid || "na"}`}
                                  style={[
                                    styles.relatedLinkButton,
                                    { backgroundColor: appColors.card, borderColor: appColors.border },
                                  ]}
                                  onPress={() => openRelatedContent(item)}
                                  hitSlop={TOUCH_HIT_SLOP}

                                >
                                  <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                                    {cleanText(prettifyNormLabel(item.title))}
                                  </Text>
                                  {item.subtitle ? (
                                    <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                                      {cleanText(prettifyNormLabel(item.subtitle))}
                                    </Text>
                                  ) : null}
                                </Pressable>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    if (extractedRelated.mainText) {
      if (document.contentType === "fallo") {
        const parsed = parseFalloContent(extractedRelated.mainText);
        return (
          <View style={styles.falloContentCard}>
            {parsed.headerLines.map((line, index) => {
              const isPrimary = index === 0 || /^SENTENCIA$/i.test(line);
              const isMetaLabel = /^Nro\.?\s*Interno:|^Id\s*SAIJ:|^Magistrados:/i.test(line);
              return (
                <Text
                  key={`${index}-${line}`}
                  style={[
                    styles.falloHeaderLine,
                    { fontSize: bodyFontSize, lineHeight: bodyLineHeight },
                    isPrimary ? styles.falloHeaderPrimary : null,
                    isMetaLabel ? styles.falloHeaderMeta : null,
                  ]}
                >
                  {renderHighlightedInline(line, `fallo-header-${index}`)}
                </Text>
              );
            })}
            {parsed.summaryText ? (
              <View style={styles.falloSummarySection}>
                <Text style={styles.falloSummaryTitle}>Sumario</Text>
                {renderHighlightedBlock(
                  parsed.summaryText,
                  [styles.contentText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight, color: readingBodyColor }],
                  "fallo-summary"
                )}
              </View>
            ) : null}
          </View>
        );
      }

      return renderHighlightedBlock(
        extractedRelated.mainText,
        [styles.contentText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight, color: readingBodyColor }],
        "main-text"
      );
    }

    return <ContentUnavailableCard reason={document.contentUnavailableReason} />;
  };

  const renderDocSearchBar = () => (
    <View style={styles.docSearchBar}>
      <Text style={styles.docSearchIcon}>{"\u2315"}</Text>
      <TextInput
        ref={docSearchInputRef}
        value={docSearchQuery}
        onChangeText={(value) => {
          setDocSearchQuery(value);
          setSearchMatchPointer(0);
        }}
        placeholder="Buscar texto dentro del documento"
        placeholderTextColor={colors.muted}
        style={styles.docSearchInput}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {normalizedSearchQuery ? <Text style={styles.docSearchCount}>{totalSearchMatches}</Text> : null}
      {normalizedSearchQuery ? (
        <Pressable
          style={styles.docSearchClearBtn}
          onPress={() => {
            setDocSearchQuery("");
            setSearchMatchPointer(0);
          }}
          hitSlop={TOUCH_HIT_SLOP}

        >
          <Text style={styles.docSearchClearBtnText}>{"\u2715"}</Text>
        </Pressable>
      ) : null}
      {articleSearchMatches.length > 0 ? (
        <View style={styles.docSearchNav}>
          <Pressable style={styles.docSearchNavBtn} onPress={goToPrevSearchMatch} hitSlop={TOUCH_HIT_SLOP}>
            <Text style={styles.docSearchNavBtnText}>{"\u2191"}</Text>
          </Pressable>
          <Pressable style={styles.docSearchNavBtn} onPress={goToNextSearchMatch} hitSlop={TOUCH_HIT_SLOP}>
            <Text style={styles.docSearchNavBtnText}>{"\u2193"}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        style={styles.docSearchCloseBtn}
        onPress={() => {
          setIsDocSearchOpen(false);
          setDocSearchQuery("");
          setSearchMatchPointer(0);
        }}
        hitSlop={TOUCH_HIT_SLOP}
      >
        <Text style={styles.docSearchCloseBtnText}>{"\u00D7"}</Text>
      </Pressable>
    </View>
  );

  const activePanelKeys = Object.keys(expandedArticlePanels)
    .filter((key) => expandedArticlePanels[key])
    .sort()
    .join("|");
  const selectedShareKeysSignature = Object.keys(selectedArticleShareKeys)
    .filter((key) => selectedArticleShareKeys[key])
    .sort()
    .join("|");
  const contentRenderKey = [
    document.guid,
    selectedSection,
    bodyFontSize,
    bodyLineHeight,
    headingFontSize,
    normalizedSearchQuery,
    activeSearchArticleIndex,
    isMultiShareMode ? 1 : 0,
    selectedShareKeysSignature,
    activePanelKeys,
    appColors.card,
    appColors.border,
    appColors.text,
    appColors.primary,
    appColors.primaryStrong,
    appColors.muted,
  ].join("::");
  if (selectedSection === "texto" && contentRenderCacheRef.current.key !== contentRenderKey) {
    contentRenderCacheRef.current = {
      key: contentRenderKey,
      node: renderContent(),
    };
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: appColors.background }]}>
      <View
        style={[
          styles.fixedHeaderWrap,
          {
            backgroundColor: appColors.background,
            borderBottomColor: appColors.border,
          },
        ]}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight > 0 && nextHeight !== fixedHeaderHeight) {
            setFixedHeaderHeight(nextHeight);
            requestAnimationFrame(() => updateStickySectionByScroll(scrollOffsetRef.current));
          }
        }}
      >
        <View style={styles.headerMainRow}>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: appColors.text }]}>{headerTitleText}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.headerActionBtn,
                isFavorite ? styles.headerActionBtnActive : null,
                pressed ? styles.headerActionBtnPressed : null,
              ]}
              onPress={toggleFavoriteCurrentDocument}
              disabled={isFavoriteBusy}
              hitSlop={TOUCH_HIT_SLOP}
            >
              <Heart
                size={20}
                color={isFavorite ? "#D22F2F" : appColors.primaryStrong}
                fill={isFavorite ? "#D22F2F" : "transparent"}
                strokeWidth={2}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerActionBtn,
                isHeaderMenuOpen ? styles.headerActionBtnActive : null,
                pressed ? styles.headerActionBtnPressed : null,
              ]}
              onPress={() => setIsHeaderMenuOpen((prev) => !prev)}
              hitSlop={TOUCH_HIT_SLOP}
            >
              <Ellipsis size={20} color={appColors.primaryStrong} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        {isHeaderMenuOpen ? (
          <View style={[styles.headerMenu, { borderColor: appColors.border, backgroundColor: appColors.card }]}>
            {selectedSection === "texto" ? (
              <Pressable
                style={({ pressed }) => [
                  styles.headerMenuItem,
                  { borderTopColor: appColors.border },
                  pressed ? styles.headerMenuItemPressed : null,
                ]}
                onPress={() => {
                  setIsHeaderMenuOpen(false);
                  toggleDocSearch();
                }}
              >
                <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>
                  {isDocSearchOpen ? "Ocultar buscador" : "Buscar en documento"}
                </Text>
              </Pressable>
            ) : null}
            {selectedSection === "texto" && articleShareItems.length > 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.headerMenuItem,
                  { borderTopColor: appColors.border },
                  pressed ? styles.headerMenuItemPressed : null,
                ]}
                onPress={() => {
                  const next = !isMultiShareMode;
                  setIsMultiShareMode(next);
                  if (!next) {
                    setSelectedArticleShareKeys({});
                    setMultiShareArticleInput("");
                  } else if (scrollRef.current) {
                    scrollRef.current.scrollTo({ y: 0, animated: true });
                  }
                  setIsHeaderMenuOpen(false);
                }}
              >
                <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>
                  {isMultiShareMode ? "Ocultar seleccion multiple" : "Seleccionar varios articulos"}
                </Text>
              </Pressable>
            ) : null}
            {isMultiShareMode ? (
              <Pressable
                style={({ pressed }) => [
                  styles.headerMenuItem,
                  { borderTopColor: appColors.border },
                  pressed ? styles.headerMenuItemPressed : null,
                ]}
                onPress={() => {
                  setIsHeaderMenuOpen(false);
                  shareSelectedArticles();
                }}
              >
                <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>
                  Compartir seleccion ({selectedShareCount})
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.headerMenuItem,
                { borderTopColor: appColors.border },
                pressed ? styles.headerMenuItemPressed : null,
              ]}
              onPress={() => {
                setIsHeaderMenuOpen(false);
                zoomOut();
              }}
            >
              <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>Achicar letra (A-)</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerMenuItem,
                { borderTopColor: appColors.border },
                pressed ? styles.headerMenuItemPressed : null,
              ]}
              onPress={() => {
                setIsHeaderMenuOpen(false);
                zoomIn();
              }}
            >
              <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>Agrandar letra (A+)</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerMenuItem,
                { borderTopColor: appColors.border },
                pressed ? styles.headerMenuItemPressed : null,
              ]}
              onPress={() => {
                setIsHeaderMenuOpen(false);
                shareWholeDocument();
              }}
            >
              <Text style={[styles.headerMenuItemText, { color: appColors.text }]}>Compartir ley completa</Text>
            </Pressable>
          </View>
        ) : null}
        {selectedSection === "texto" && stickySectionLabel ? (
          <Pressable
            style={({ pressed }) => [
              styles.stickySectionWrap,
              {
                backgroundColor: isDarkMode ? "#16213B" : "#EEF3FF",
                borderColor: isDarkMode ? "#2B3B64" : "#D6E2FF",
              },
              pressed ? styles.stickySectionWrapPressed : null,
            ]}
            onPress={openStickySectionIndex}
            hitSlop={TOUCH_HIT_SLOP}
          >
            <Text
              style={[
                styles.stickySectionText,
                { fontSize: Math.max(13, bodyFontSize - 0.2), color: appColors.primaryStrong },
              ]}
            >
              {stickySectionLabel}
            </Text>
            <Text style={[styles.stickySectionHint, { color: appColors.primaryStrong }]}>Tocar para abrir indice rapido</Text>
          </Pressable>
        ) : null}
        {selectedSection === "texto" && isMultiShareMode && articleShareItems.length > 0 ? (
          <View style={styles.multiShareTopBar}>
            <View style={styles.multiShareTopHeader}>
              <Text style={styles.multiShareTopTitle}>Seleccionados: {selectedShareCount}</Text>
              <View style={styles.multiShareTopActions}>
                <Pressable
                  style={[styles.multiShareTopShareBtn, selectedShareCount < 1 ? styles.multiShareTopShareBtnDisabled : null]}
                  onPress={shareSelectedArticles}
                  disabled={selectedShareCount < 1}
                  hitSlop={TOUCH_HIT_SLOP}
                >
                  <Text style={styles.multiShareTopShareText}>Compartir todos</Text>
                </Pressable>
                <Pressable
                  style={styles.multiShareTopCloseBtn}
                  onPress={() => {
                    setIsMultiShareMode(false);
                    clearMultiShareSelection();
                  }}
                  hitSlop={TOUCH_HIT_SLOP}
                >
                  <Text style={styles.multiShareTopCloseText}>Cerrar</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.multiShareTopInputRow}>
              <TextInput
                ref={multiShareInputRef}
                value={multiShareArticleInput}
                onChangeText={(value) => {
                  multiShareInputValueRef.current = value;
                  setMultiShareArticleInput(value);
                }}
                onSubmitEditing={(event) => addArticlesToSelectionFromInput(event.nativeEvent.text)}
                placeholder="Agregar por nro: 1, 2, 10-12"
                placeholderTextColor={colors.muted}
                style={styles.multiShareTopInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Pressable
                style={styles.multiShareTopAddBtn}
                onPress={() => addArticlesToSelectionFromInput(multiShareInputValueRef.current)}
                hitSlop={TOUCH_HIT_SLOP}
              >
                <Text style={styles.multiShareTopAddText}>Agregar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {selectedSection === "texto" && isDocSearchOpen ? (
          <View style={styles.headerSearchWrap}>{renderDocSearchBar()}</View>
        ) : null}
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        persistentScrollbar={false}
        removeClippedSubviews={false}
        overScrollMode="never"
        {...sectionSwipeResponder.panHandlers}
        onLayout={(event) => {
          scrollViewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => handleDetailScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        onContentSizeChange={(_, contentHeight) => {
          scrollContentHeightRef.current = contentHeight;
          geometryTableDirtyRef.current = true;
          restoreSavedScrollIfNeeded();
        }}
      >
        <View style={[styles.metaCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
          <MetadataRow label="Tipo" value={typeLabel} />
          <MetadataRow label={secondaryMeta.label} value={secondaryMeta.value} valueColor={secondaryMeta.color} />
        </View>

        {attachmentUrl ? (
          <Pressable
            style={[
              styles.attachmentButton,
              {
                backgroundColor: appColors.card,
                borderColor: appColors.primaryStrong,
              },
            ]}
            onPress={() => Linking.openURL(attachmentUrl)}
            hitSlop={TOUCH_HIT_SLOP}

          >
            <Text style={[styles.attachmentButtonText, { color: appColors.primaryStrong }]}>{attachmentLabel}</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionTabs}>
          {sectionItems.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.sectionTab,
                {
                  borderColor: appColors.border,
                  backgroundColor: appColors.card,
                },
                selectedSection === item.key ? styles.sectionTabActive : null,
                pressed ? styles.sectionTabPressed : null,
              ]}
              onPress={() => setActiveSectionSafe(item.key)}
              hitSlop={TOUCH_HIT_SLOP}

            >
              <Text
                style={[
                  styles.sectionTabText,
                  { color: appColors.muted },
                  selectedSection === item.key ? [styles.sectionTabTextActive, { color: appColors.primaryStrong }] : null,
                ]}
              >
                {item.label}
                {typeof item.count === "number" ? ` (${item.count})` : ""}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedSection === "encabezado" && leadText ? (
          <View style={styles.articleCard}>
            {renderHighlightedBlock(
              leadText,
              [styles.articleText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }],
              "lead-text"
            )}
          </View>
        ) : null}

        {selectedSection === "texto" ? contentRenderCacheRef.current.node : null}

        {selectedSection === "normasComplementarias" && normasComplementarias.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Normas complementarias</Text>
            {normasComplementarias.map((item, index) => (
              <Pressable
                key={`normas-comp-${index}-${item.title}-${item.guid || "na"}`}
                style={[styles.relatedLinkButton, { backgroundColor: appColors.card, borderColor: appColors.border }]}
                onPress={() => openRelatedContent(item)}
                hitSlop={TOUCH_HIT_SLOP}

              >
                <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                  {cleanText(prettifyNormLabel(item.title))}
                </Text>
                {item.subtitle ? (
                  <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                    {cleanText(prettifyNormLabel(item.subtitle))}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedSection === "normasQueModifica" && normasQueModifica.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Normas que modifica</Text>
            {normasQueModifica.map((item, index) => (
              <Pressable
                key={`normas-mod-${index}-${item.title}-${item.guid || "na"}`}
                style={[styles.relatedLinkButton, { backgroundColor: appColors.card, borderColor: appColors.border }]}
                onPress={() => openRelatedContent(item)}
                hitSlop={TOUCH_HIT_SLOP}

              >
                <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                  {cleanText(prettifyNormLabel(item.title))}
                </Text>
                {item.subtitle ? (
                  <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                    {cleanText(prettifyNormLabel(item.subtitle))}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedSection === "observaciones" && observacionesItems.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Observaciones</Text>
            {observacionesItems.map((item, index) => (
              <Pressable
                key={`obs-${index}-${item.title}-${item.guid || "na"}`}
                style={[styles.relatedLinkButton, { backgroundColor: appColors.card, borderColor: appColors.border }]}
                onPress={() => openRelatedContent(item)}
                hitSlop={TOUCH_HIT_SLOP}

              >
                <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                  {cleanText(prettifyNormLabel(item.title))}
                </Text>
                {item.subtitle ? (
                  <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                    {cleanText(prettifyNormLabel(item.subtitle))}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedSection === "contenidoRelacionado" && relatedContentItems.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Contenido relacionado</Text>
            {relatedContentItems.map((item, index) => (
              <Pressable
                key={`rel-${index}-${item.title}-${item.guid || "na"}`}
                style={[styles.relatedLinkButton, { backgroundColor: appColors.card, borderColor: appColors.border }]}
                onPress={() => openRelatedContent(item)}
                hitSlop={TOUCH_HIT_SLOP}

              >
                <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                  {cleanText(prettifyNormLabel(item.title))}
                </Text>
                {item.subtitle ? (
                  <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                    {cleanText(prettifyNormLabel(item.subtitle))}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedSection === "fallosAplica" && relatedFallos.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Fallos a los que aplica</Text>
            {relatedFallos.map((fallo, index) => (
              <Pressable
                key={`fallo-aplica-${index}-${fallo.title}`}
                style={[styles.relatedLinkButton, { backgroundColor: appColors.card, borderColor: appColors.border }]}
                onPress={() => openRelatedFallo(fallo)}
                hitSlop={TOUCH_HIT_SLOP}

              >
                <Text style={[styles.relatedLinkTitle, { color: appColors.primaryStrong }]}>
                  {cleanText(prettifyNormLabel(fallo.title))}
                </Text>
                {fallo.subtitle ? (
                  <Text style={[styles.relatedLinkSubtitle, { color: appColors.muted }]}>
                    {cleanText(prettifyNormLabel(fallo.subtitle))}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {selectedSection === "texto" && searchableArticles.length > 0 ? (
        <View
          ref={scrubberTrackRef}
          style={[
            styles.articleScrubberTrack,
            {
              top: fixedHeaderHeight + 10,
              bottom: Math.max(spacing.xl + 12, insets.bottom + 34),
            },
            isScrubbingArticles ? styles.articleScrubberTrackActive : null,
          ]}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            setScrubberHeight(nextHeight);
            requestAnimationFrame(() => {
              measureScrubberTrackWindowPosition();
              updateThumbByScrollY(scrollOffsetRef.current);
            });
          }}
          {...articleScrubberResponder.panHandlers}
        >
          <View style={[styles.articleScrubberRail, { backgroundColor: "rgba(27, 55, 94, 0.22)" }]} />
          <Animated.View
            style={[
              styles.articleScrubberThumb,
              {
                backgroundColor: isDarkMode ? "#233B66" : "#E2EEFF",
                borderColor: isDarkMode ? "#2D497B" : "#C7DBFF",
                borderWidth: 1,
                transform: [{ translateY: scrubberThumbTopAnimRef.current }],
              },
            ]}
          />
          {activeArticlePreviewLabel ? (
            <Animated.View
              style={[
                styles.scrubberPreviewBubble,
                {
                  top: 0,
                  opacity: scrubberBubbleOpacityRef.current,
                  backgroundColor: isDarkMode ? "#233B66" : "#E2EEFF",
                  borderColor: isDarkMode ? "#2D497B" : "#C7DBFF",
                  transform: [{ translateY: scrubberBubbleTopAnimRef.current }],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.scrubberPreviewTail,
                  {
                    top: scrubberBubbleTailTopAnimRef.current,
                    backgroundColor: isDarkMode ? "#233B66" : "#E2EEFF",
                    borderColor: isDarkMode ? "#2D497B" : "#C7DBFF",
                  },
                ]}
              />
              <Text style={[styles.scrubberPreviewText, { color: isDarkMode ? "#F3F7FF" : "#1b375e" }]}>
                {activeArticlePreviewLabel}
              </Text>
              {activeArticlePreviewHeading ? (
                <Text style={[styles.scrubberPreviewSubtitle, { color: isDarkMode ? "#C9D9F7" : "#4E6285" }]} numberOfLines={1}>
                  {activeArticlePreviewHeading}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      <Modal
        visible={isStickyIndexOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsStickyIndexOpen(false)}
      >
        <Pressable style={styles.stickyIndexBackdrop} onPress={() => setIsStickyIndexOpen(false)}>
          <Pressable
            style={[styles.stickyIndexCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}
            onPress={() => {}}
          >
            <View style={[styles.stickyIndexHeader, { borderBottomColor: appColors.border, backgroundColor: appColors.card }]}>
              <Text style={[styles.stickyIndexTitle, { color: appColors.text }]}>Indice rapido</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.stickyIndexCloseBtn,
                  { borderColor: appColors.border, backgroundColor: appColors.card },
                  pressed ? styles.stickyIndexCloseBtnPressed : null,
                ]}
                onPress={() => setIsStickyIndexOpen(false)}
                hitSlop={TOUCH_HIT_SLOP}
              >
                <Text style={[styles.stickyIndexCloseText, { color: appColors.muted }]}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.stickyIndexList} keyboardShouldPersistTaps="handled">
              {stickyIndexEntries.map((entry, index) => (
                <Pressable
                  key={`${entry.label}-${entry.y}-${index}`}
                  style={({ pressed }) => [
                    styles.stickyIndexItem,
                    { borderColor: appColors.border, backgroundColor: isDarkMode ? "#111B33" : "#F8FAFC" },
                    pressed ? styles.stickyIndexItemPressed : null,
                  ]}
                  onPress={() => jumpToStickyEntry(entry)}
                  hitSlop={TOUCH_HIT_SLOP}
                >
                  <Text style={[styles.stickyIndexItemText, { color: appColors.primaryStrong }]}>{entry.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fixedHeaderWrap: {
    paddingHorizontal: readingTypography.horizontalPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    zIndex: 25,
  },
  headerMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: readingTypography.lawTitleSize,
    fontWeight: "700",
    color: colors.text,
    lineHeight: readingTypography.lawTitleLineHeight,
  },
  headerSubtitle: {
    fontSize: readingTypography.metadataSize,
    lineHeight: readingTypography.metadataLineHeight,
    color: colors.muted,
    fontWeight: "400",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingTop: 0,
  },
  headerActionBtn: {
    minWidth: 32,
    height: 32,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionBtnActive: {
    backgroundColor: "transparent",
  },
  headerActionBtnPressed: {
    opacity: 0.7,
  },
  headerActionBtnText: {
    color: colors.primaryStrong,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 24,
  },
  headerActionBtnTextActive: {
    color: colors.primaryStrong,
  },
  headerMenu: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  headerMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
  },
  headerMenuItemPressed: {
    backgroundColor: "#F1F5FF",
  },
  headerMenuItemText: {
    color: colors.text,
    fontSize: typography.small + 1,
    fontWeight: "600",
  },
  headerSearchWrap: {
    marginTop: spacing.xs,
  },
  container: {
    paddingHorizontal: readingTypography.horizontalPadding,
    paddingVertical: spacing.md,
    gap: readingTypography.blockGap,
  },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: readingTypography.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentButton: {
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primaryStrong,
  },
  attachmentButtonText: {
    color: colors.primaryStrong,
    fontSize: typography.body,
    fontWeight: "600",
  },
  sectionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  sectionTab: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    minHeight: 34,
    justifyContent: "center",
  },
  sectionTabActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  sectionTabPressed: {
    opacity: 0.75,
  },
  sectionTabText: {
    color: colors.muted,
    fontSize: typography.small + 1,
    fontWeight: "600",
  },
  sectionTabTextActive: {
    color: colors.primaryStrong,
  },
  multiShareTopBar: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#CBD8FF",
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  multiShareTopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  multiShareTopTitle: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  multiShareTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  multiShareTopShareBtn: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  multiShareTopShareBtnDisabled: {
    opacity: 0.45,
  },
  multiShareTopShareText: {
    color: "#FFFFFF",
    fontSize: typography.small,
    fontWeight: "700",
  },
  multiShareTopCloseBtn: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F5F7FC",
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  multiShareTopCloseText: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "700",
  },
  multiShareTopInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  multiShareTopInput: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F9FBFF",
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: typography.small + 1,
  },
  multiShareTopAddBtn: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
    justifyContent: "center",
    alignItems: "center",
  },
  multiShareTopAddText: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
  },
  docSearchBar: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stickySectionWrap: {
    marginTop: spacing.xs,
    backgroundColor: "#EEF3FF",
    borderColor: "#D6E2FF",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  stickySectionWrapPressed: {
    backgroundColor: "#E2EAFF",
  },
  stickySectionText: {
    color: colors.primaryStrong,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
    lineHeight: 17,
  },
  stickySectionHint: {
    marginTop: 2,
    color: colors.primaryStrong,
    fontSize: typography.small - 1,
    textAlign: "center",
    opacity: 0.8,
  },
  docSearchIcon: {
    color: colors.muted,
    fontSize: typography.body + 2,
    fontWeight: "700",
  },
  docSearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    paddingVertical: 8,
  },
  docSearchCount: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
    minWidth: 22,
    textAlign: "center",
  },
  docSearchClearBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F5F7FC",
  },
  docSearchClearBtnText: {
    color: colors.muted,
    fontSize: typography.body + 1,
    fontWeight: "700",
    lineHeight: 17,
  },
  docSearchNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  docSearchNavBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F5F7FC",
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  docSearchNavBtnText: {
    color: colors.primaryStrong,
    fontSize: typography.body + 1,
    fontWeight: "700",
    lineHeight: 16,
  },
  docSearchCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F5F7FC",
    alignItems: "center",
    justifyContent: "center",
  },
  docSearchCloseBtnText: {
    color: colors.muted,
    fontSize: typography.small + 2,
    fontWeight: "700",
    lineHeight: 16,
  },
  relatedSection: {
    gap: readingTypography.paragraphGap,
  },
  relatedTitle: {
    fontSize: readingTypography.sectionLabelSize,
    lineHeight: readingTypography.sectionLabelLineHeight,
    fontWeight: "600",
    color: readingTypography.labelTextColor,
    letterSpacing: readingTypography.sectionLabelLetterSpacing,
    textTransform: "uppercase",
  },
  relatedLinkButton: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  relatedLinkTitle: {
    color: colors.primaryStrong,
    fontSize: readingTypography.articleLeadSize,
    lineHeight: readingTypography.articleLeadLineHeight,
    fontWeight: "600",
  },
  relatedLinkSubtitle: {
    color: readingTypography.secondaryTextColor,
    fontSize: readingTypography.metadataSize,
    lineHeight: readingTypography.metadataLineHeight,
  },
  falloContentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  falloHeaderLine: {
    fontSize: readingTypography.articleBodySize,
    color: readingTypography.bodyTextColor,
    lineHeight: Math.round(readingTypography.articleBodySize * readingTypography.articleBodyLineHeightRatio),
  },
  falloHeaderPrimary: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  falloHeaderMeta: {
    color: colors.muted,
  },
  falloSummarySection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  falloSummaryTitle: {
    fontSize: readingTypography.sectionLabelSize,
    lineHeight: readingTypography.sectionLabelLineHeight,
    fontWeight: "600",
    color: readingTypography.labelTextColor,
    letterSpacing: readingTypography.sectionLabelLetterSpacing,
    textTransform: "uppercase",
  },
  contentText: {
    fontSize: readingTypography.articleBodySize,
    color: readingTypography.bodyTextColor,
    lineHeight: Math.round(readingTypography.articleBodySize * readingTypography.articleBodyLineHeightRatio),
    letterSpacing: 0.1,
  },
  searchHighlight: {
    backgroundColor: "#FFE08A",
    color: colors.text,
  },
  articles: {
    gap: readingTypography.articleGap,
  },
  articleBlock: {
    gap: spacing.md,
  },
  sectionHeading: {
    color: readingTypography.labelTextColor,
    fontSize: readingTypography.sectionLabelSize,
    lineHeight: readingTypography.sectionLabelLineHeight,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: readingTypography.sectionLabelLetterSpacing,
    textTransform: "uppercase",
  },
  articleCard: {
    backgroundColor: readingTypography.articleCardBackground,
    borderRadius: radius.md,
    padding: readingTypography.cardPadding,
    borderWidth: 1,
    borderColor: colors.border,
    gap: readingTypography.paragraphGap,
  },
  articleCardSearchHit: {
    borderColor: "#C7D2FE",
    backgroundColor: "#F8FAFF",
  },
  articleCardSearchActive: {
    borderColor: colors.primaryStrong,
    borderWidth: 1.5,
  },
  articlePanelContainer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  articlePanelBlock: {
    gap: spacing.xs,
  },
  articlePanelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    backgroundColor: "#F5F7FC",
    alignSelf: "flex-start",
    minHeight: 34,
    justifyContent: "center",
  },
  articlePanelButtonText: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  articlePanelContent: {
    gap: spacing.xs,
  },
  articleTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    color: colors.text,
  },
  articleLeadInline: {
    fontWeight: "600",
    color: readingTypography.bodyTextColor,
    letterSpacing: 0.1,
  },
  articleLeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  articleLeadActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  articleSelectBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F5F7FC",
    minWidth: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  articleSelectBtnActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  articleSelectBtnText: {
    color: colors.muted,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 16,
  },
  articleSelectBtnTextActive: {
    color: colors.primaryStrong,
  },
  articleShareBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F5F7FC",
    minWidth: 30,
    height: 28,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  articleShareBtnActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  articleShareBtnText: {
    color: colors.primaryStrong,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 16,
  },
  articleShareBtnTextActive: {
    color: colors.primaryStrong,
  },
  articleText: {
    fontSize: readingTypography.articleBodySize,
    color: readingTypography.bodyTextColor,
    lineHeight: Math.round(readingTypography.articleBodySize * readingTypography.articleBodyLineHeightRatio),
    letterSpacing: 0.1,
  },
  articleScrubberTrack: {
    position: "absolute",
    top: spacing.xl + 72,
    bottom: spacing.xl + 12,
    right: 2,
    width: 14,
    borderRadius: 10,
    backgroundColor: "rgba(27, 55, 94, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(27, 55, 94, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
    zIndex: 40,
    elevation: 10,
  },
  articleScrubberTrackActive: {
    backgroundColor: "rgba(27, 55, 94, 0.13)",
    borderColor: "rgba(27, 55, 94, 0.25)",
  },
  articleScrubberRail: {
    width: 2,
    height: "100%",
    borderRadius: 2,
  },
  articleScrubberThumb: {
    position: "absolute",
    top: 0,
    left: 1,
    width: 10,
    height: SCRUBBER_THUMB_HEIGHT,
    borderRadius: 6,
  },
  scrubberPreviewBubble: {
    position: "absolute",
    right: 6,
    minWidth: 132,
    height: SCRUBBER_BUBBLE_HEIGHT,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.11,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 41,
  },
  scrubberPreviewTail: {
    position: "absolute",
    right: -7,
    width: 14,
    height: 14,
    borderTopWidth: 1,
    borderRightWidth: 1,
    transform: [{ rotate: "45deg" }],
    borderTopColor: "#C7DBFF",
    borderRightColor: "#C7DBFF",
  },
  scrubberPreviewText: {
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  scrubberPreviewSubtitle: {
    marginTop: 2,
    fontSize: typography.tiny,
    fontWeight: "600",
    maxWidth: 132,
  },
  stickyIndexBackdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 13, 30, 0.5)",
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  stickyIndexCard: {
    maxHeight: "72%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  stickyIndexHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#F8FAFF",
  },
  stickyIndexTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  stickyIndexCloseBtn: {
    minHeight: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  stickyIndexCloseBtnPressed: {
    backgroundColor: "#EEF3FF",
    borderColor: "#C7D2FE",
  },
  stickyIndexCloseText: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "700",
  },
  stickyIndexList: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  stickyIndexItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stickyIndexItemPressed: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#EAF0FF",
  },
  stickyIndexItemText: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
    lineHeight: 18,
  },
});




















