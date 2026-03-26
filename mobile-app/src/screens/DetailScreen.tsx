import { Alert, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRef, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import RenderHTML from "react-native-render-html";
import { useSaijDocument } from "../hooks/useSaijDocument";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { DetailHeader } from "../components/DetailHeader";
import { MetadataRow } from "../components/MetadataRow";
import { ContentUnavailableCard } from "../components/ContentUnavailableCard";
import { colors, radius, spacing, typography } from "../constants/theme";
import { cleanText, formatDate } from "../utils/format";
import { sanitizeHtml } from "../utils/content";
import { searchSaij } from "../services/saijApi";

const DETAIL_SCROLL_OFFSET_BY_GUID: Record<string, number> = {};

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
  if (raw.includes("·")) {
    return raw.split("·")[0]?.trim() || "";
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
      .replace(/[°º]/g, " ")
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
    const resol = compact.match(/\bresoluci[oó]n\b[^\d]*(\d{1,7})\b/i);
    if (resol) return `resolucion:${Number(resol[1])}`;
    const rawCode = compact.match(/^(ley|dnu|dec|decreto|res|resolucion)\s+c?\s*0*(\d{1,7})\b/i);
    if (rawCode) return `${rawCode[1]}:${Number(rawCode[2])}`;
    return "";
  };

  const score = (item: RelatedContentItem) => {
    const title = String(item.title || "").trim();
    const subtitle = String(item.subtitle || "").trim();
    const guid = String(item.guid || "").trim();
    const generic = /^(ley|decreto|dnu|resoluci[oó]n)\b/i.test(title);
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

  const resol = clean.match(/^RES(?:OLUCION|OLUCIÓN)?\s+C?\s+0*(\d{1,7})(?:\s+(\d{4}))?\b/i);
  if (resol) return `Resolución ${Number(resol[1])}${resol[2] ? `/${resol[2]}` : ""}`;

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

const SECTION_HEADING_PATTERN = /^(ANEXO|T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|LIBRO|PARTE)\b/i;

const parseArticleTitleContext = (title?: string | null) => {
  if (!title || typeof title !== "string") {
    return { headings: [] as string[], articleLabel: null as string | null };
  }
  const parts = title
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!parts.length) {
    return { headings: [] as string[], articleLabel: null as string | null };
  }

  const headings = parts.filter((part) => SECTION_HEADING_PATTERN.test(part));
  const lastPart = parts[parts.length - 1];
  const articleLabel = SECTION_HEADING_PATTERN.test(lastPart) ? null : lastPart;
  return { headings, articleLabel };
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
  const title = headings.filter((line) => /^T[ÍI]TULO\b/i.test(line)).at(-1) || null;
  const chapter = headings.filter((line) => /^CAP[ÍI]TULO\b/i.test(line)).at(-1) || null;
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
  const compact = raw.replace(/\s+/g, " ");

  const annex = compact.match(/^a0*(\d+)$/i);
  if (annex) return String(Number(annex[1]));

  const withCode = compact.match(/^(\d+)\s+0?(\d{1,2})$/);
  if (withCode) {
    const base = Number(withCode[1]);
    const code = Number(withCode[2]);
    const suffix = ARTICLE_SUFFIX_BY_CODE[code];
    return suffix ? `${base} ${suffix}` : String(base);
  }

  const withLiteralSuffix = compact.match(/^(\d+)\s+([a-záéíóú]+)$/i);
  if (withLiteralSuffix) {
    return `${Number(withLiteralSuffix[1])} ${withLiteralSuffix[2].toLowerCase()}`;
  }

  const numeric = compact.match(/^\d+$/);
  if (numeric) return String(Number(compact));
  return compact.toLowerCase();
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
  const trimmed = text.trimStart();
  if (!trimmed) return trimmed;
  const genericPattern =
    /^[\"“”'\s]*?(?:ART[ÍI]CULO|ART\.?)\s*\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\s*(?:°|º|o)?\s*[\.:\-–—]*\s*/i;
  const genericCleaned = trimmed.replace(genericPattern, "").trimStart();
  if (genericCleaned.length > 0 && genericCleaned !== trimmed) return genericCleaned;

  if (!articleNumber || typeof articleNumber !== "string") return trimmed;
  const normalizedDisplay = normalizeArticleNumberDisplay(articleNumber);
  const candidates = Array.from(
    new Set([articleNumber.trim(), normalizedDisplay].filter((token) => token && token.length > 0))
  );
  for (const candidate of candidates) {
    const escapedNumber = escapeRegExp(candidate);
    if (!escapedNumber) continue;
    const pattern = new RegExp(
      `^[\"“”'\\s]*?(?:ART[ÍI]CULO|ART\\.?)\\s*${escapedNumber}\\s*(?:°|º|o)?\\s*[\\.:\\-–—]*\\s*`,
      "i"
    );
    const cleaned = trimmed.replace(pattern, "").trimStart();
    if (cleaned.length > 0 && cleaned !== trimmed) return cleaned;
  }
  return trimmed;
};

const extractLeadTextBeforeFirstArticle = (text?: string | null) => {
  if (!text || typeof text !== "string") return null;
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;
  const match = normalized.match(/(?:^|\n)\s*(?:ART[ÍI]CULO|ART\.?)\s*\d+/i);
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
  const params = useLocalSearchParams<{ guid?: string }>();
  const guidParam = Array.isArray(params.guid) ? params.guid[0] : params.guid;

  const { document, isLoading, isError, error, refetch } = useSaijDocument(guidParam);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeSection, setActiveSection] = useState<string>("texto");
  const [expandedArticlePanels, setExpandedArticlePanels] = useState<Record<string, boolean>>({});
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [searchMatchPointer, setSearchMatchPointer] = useState(0);
  const [textZoom, setTextZoom] = useState(0.94);
  const [activeArticlePreviewIndex, setActiveArticlePreviewIndex] = useState<number>(-1);
  const [stickySectionLabel, setStickySectionLabel] = useState<string | null>(null);
  const [stickySectionTranslateY, setStickySectionTranslateY] = useState(0);
  const [isScrubbingArticles, setIsScrubbingArticles] = useState(false);
  const [scrubberHeight, setScrubberHeight] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const articleOffsetsRef = useRef<Record<number, number>>({});
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
  const stickySectionCacheRef = useRef<{ label: string | null; translateY: number }>({
    label: null,
    translateY: 0,
  });

  const setArticleScrubbing = (value: boolean) => {
    isScrubbingArticlesRef.current = value;
    setIsScrubbingArticles(value);
  };

  const toggleArticlePanel = (key: string) => {
    setExpandedArticlePanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setActiveSectionSafe = (nextSection: string) => {
    setArticleScrubbing(false);
    stickySectionCacheRef.current = { label: null, translateY: 0 };
    setStickySectionLabel(null);
    setStickySectionTranslateY(0);
    setActiveSection(nextSection);
  };

  const zoomOut = () => setTextZoom((prev) => Math.max(0.82, Math.round((prev - 0.06) * 100) / 100));
  const zoomIn = () => setTextZoom((prev) => Math.min(1.34, Math.round((prev + 0.06) * 100) / 100));

  if (!guidParam) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState message="No se encontro el documento." />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState message="Cargando documento..." />
      </SafeAreaView>
    );
  }

  if (isError || !document) {
    return (
      <SafeAreaView style={styles.safeArea}>
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
  const bodyFontSize = Math.round(typography.body * clampedTextZoom * 10) / 10;
  const bodyLineHeight = Math.max(18, Math.round(bodyFontSize * 1.45));
  const headingFontSize = Math.round(typography.subtitle * clampedTextZoom * 10) / 10;
  const stickySearchTop = Math.max(insets.top + 8, 56);
  const stickySearchHeight = 44;
  const stickySectionHeight = 34;
  const stickySectionTop = stickySearchTop + stickySearchHeight + 6;
  const subtitleText = getSubtitleText(document.subtitle);
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
    falloParsed.headerLines.find((line) => /CORTE|CAMARA|C[ÁA]MARA|TRIBUNAL|JUZGADO/i.test(line)) || null;
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
          value: [falloFechaDisplay, falloTribunalDisplay].filter(Boolean).join(" · ") || "No informado",
          color: colors.text,
        }
      : baseTypeLabel === "doctrina"
        ? {
            label: "Autor",
            value: autorDoctrina || "No informado",
            color: colors.text,
          }
        : baseTypeLabel === "dictamen"
          ? {
              label: "Organismo",
              value: (typeof document.organismo === "string" && document.organismo.trim()) || "No informado",
              color: colors.text,
            }
          : baseTypeLabel === "sumario"
            ? {
                label: "Fecha",
                value: metadataDate || "No informado",
                color: colors.text,
              }
            : {
                label: "Estado de vigencia",
                value: estadoVigencia || "No informado",
                color: estadoVigencia ? getVigenciaColor(estadoVigencia) : colors.muted,
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
  const normalizedSearchQuery = docSearchQuery.trim().toLowerCase();
  const articleSearchMatches = (() => {
    if (!normalizedSearchQuery || !searchableArticles.length) return [] as number[];
    const hits: number[] = [];
    searchableArticles.forEach((article, index) => {
      const haystack = `${article.number || ""} ${article.title || ""} ${article.text || ""}`.toLowerCase();
      if (haystack.includes(normalizedSearchQuery)) hits.push(index);
    });
    return hits;
  })();
  const articleSearchMatchSet = new Set(articleSearchMatches);
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

  const jumpToY = (y: number, animated = true, topOffset = 130) => {
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
    if (typeof y === "number") jumpToY(y, options?.animated ?? true, options?.topOffset ?? 130);
  };

  const getTargetArticleIndexFromLocationY = (locationY: number) => {
    if (!searchableArticles.length || scrubberHeight <= 0) return -1;
    const clamped = Math.max(0, Math.min(locationY, scrubberHeight));
    const ratio = clamped / scrubberHeight;
    const maxIndex = searchableArticles.length - 1;
    return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
  };

  const scrubToLocationY = (locationY: number) => {
    const nextIndex = getTargetArticleIndexFromLocationY(locationY);
    if (nextIndex < 0) return;
    if (nextIndex !== scrubActiveIndexRef.current) {
      scrubActiveIndexRef.current = nextIndex;
      setActiveArticlePreviewIndex(nextIndex);
      const measuredY = articleOffsetsRef.current[nextIndex];
      if (typeof measuredY === "number" && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, measuredY - 96), animated: false });
      } else {
        const maxScroll = Math.max(0, scrollContentHeightRef.current - scrollViewportHeightRef.current);
        const fallbackY = (nextIndex / Math.max(1, searchableArticles.length - 1)) * maxScroll;
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ y: fallbackY, animated: false });
        }
      }
    }
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
    articleStickyMetaRef.current = {};
    articleStickySortedRef.current = [];
    articleStickyDirtyRef.current = true;
    stickySectionCacheRef.current = { label: null, translateY: 0 };
    restoredGuidRef.current = null;
    scrollOffsetRef.current = DETAIL_SCROLL_OFFSET_BY_GUID[document.guid] ?? 0;
    scrubActiveIndexRef.current = -1;
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
  const scrubberPreviewTop =
    safeActiveArticlePreviewIndex >= 0 && scrubberHeight > 0
      ? Math.max(
          0,
          Math.min(
            Math.max(0, scrubberHeight - 52),
            ((safeActiveArticlePreviewIndex / Math.max(1, searchableArticles.length - 1)) * scrubberHeight) - 26
          )
        )
      : 0;

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

  const updateStickySectionByScroll = (scrollY: number) => {
    if (selectedSection !== "texto") {
      if (stickySectionCacheRef.current.label !== null || stickySectionCacheRef.current.translateY !== 0) {
        stickySectionCacheRef.current = { label: null, translateY: 0 };
        setStickySectionLabel(null);
        setStickySectionTranslateY(0);
      }
      return;
    }

    const entries = getSortedStickyEntries();
    if (!entries.length) {
      if (stickySectionCacheRef.current.label !== null || stickySectionCacheRef.current.translateY !== 0) {
        stickySectionCacheRef.current = { label: null, translateY: 0 };
        setStickySectionLabel(null);
        setStickySectionTranslateY(0);
      }
      return;
    }

    const anchorY = scrollY + stickySectionTop;
    let currentIndex = -1;
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i].y <= anchorY) currentIndex = i;
      else break;
    }
    if (currentIndex < 0) {
      if (stickySectionCacheRef.current.label !== null || stickySectionCacheRef.current.translateY !== 0) {
        stickySectionCacheRef.current = { label: null, translateY: 0 };
        setStickySectionLabel(null);
        setStickySectionTranslateY(0);
      }
      return;
    }

    const current = entries[currentIndex];
    const next = entries[currentIndex + 1];
    const distanceToNext = next ? next.y - anchorY : Number.POSITIVE_INFINITY;
    const translateY = distanceToNext < stickySectionHeight ? distanceToNext - stickySectionHeight : 0;

    if (stickySectionCacheRef.current.label !== current.label) {
      stickySectionCacheRef.current.label = current.label;
      setStickySectionLabel(current.label);
    }
    if (Math.abs(stickySectionCacheRef.current.translateY - translateY) > 0.5) {
      stickySectionCacheRef.current.translateY = translateY;
      setStickySectionTranslateY(translateY);
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
    if (document.guid) DETAIL_SCROLL_OFFSET_BY_GUID[document.guid] = y;
    updateStickySectionByScroll(y);
  };

  const restoreSavedScrollIfNeeded = () => {
    if (!document.guid || !scrollRef.current) return;
    if (restoredGuidRef.current === document.guid) return;
    const saved = DETAIL_SCROLL_OFFSET_BY_GUID[document.guid];
    restoredGuidRef.current = document.guid;
    if (typeof saved !== "number" || saved <= 0) return;
    if (restorePendingRef.current) return;
    restorePendingRef.current = true;
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, saved), animated: false });
        handleDetailScroll(saved);
      }
      restorePendingRef.current = false;
    }, 20);
  };

  const stopScrubbing = () => {
    if (isScrubbingArticlesRef.current) setArticleScrubbing(false);
    scrubActiveIndexRef.current = -1;
  };

  const articleScrubberResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => selectedSection === "texto" && searchableArticles.length > 0,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      selectedSection === "texto" && searchableArticles.length > 0 && Math.abs(gestureState.dy) > 1,
    onPanResponderGrant: (event) => {
      setArticleScrubbing(true);
      scrubToLocationY(event.nativeEvent.locationY);
    },
    onPanResponderMove: (event) => {
      if (!isScrubbingArticlesRef.current) return;
      scrubToLocationY(event.nativeEvent.locationY);
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
      .replace(/[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ\s]/g, " ")
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
            const articleTextWithoutDuplicateLabel = stripRepeatedArticleLead(articleText, article.number);
            const parsedTitle = parseArticleTitleContext(article.title);
            const displayArticleNumber = normalizeArticleNumberDisplay(article.number, index + 1);
            const articleLeadTitle = `ARTICULO ${displayArticleNumber}${
              parsedTitle.articleLabel ? `.- ${cleanText(parsedTitle.articleLabel)}` : ".-"
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
                  articleStickyMetaRef.current[index] = { y, label: stickyLabelForArticle };
                  articleStickyDirtyRef.current = true;
                  updateStickySectionByScroll(scrollOffsetRef.current);
                }}
              >
                {headingLines.map((heading, headingIndex) => (
                  <Text
                    key={`${articleKey}-h-${headingIndex}`}
                    style={[styles.sectionHeading, { fontSize: Math.max(17, headingFontSize + 1) }]}
                  >
                    {cleanText(heading)}
                  </Text>
                ))}
                <View
                  style={[
                    styles.articleCard,
                    isSearchHit ? styles.articleCardSearchHit : null,
                    isSearchActive ? styles.articleCardSearchActive : null,
                  ]}
                >
                  <Text style={[styles.articleText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}>
                    <Text style={styles.articleLeadInline}>{articleLeadTitle} </Text>
                    {renderHighlightedInline(articleTextWithoutDuplicateLabel, `${articleKey}-body`)}
                  </Text>
                  {articlePanels.length > 0 ? (
                    <View style={styles.articlePanelContainer}>
                      {articlePanels.map((panel) => (
                        <View key={panel.key} style={styles.articlePanelBlock}>
                          <Pressable
                            style={styles.articlePanelButton}
                            onPress={() => toggleArticlePanel(panel.key)}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
                                  style={styles.relatedLinkButton}
                                  onPress={() => openRelatedContent(item)}
                                >
                                  <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(item.title))}</Text>
                                  {item.subtitle ? (
                                    <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(item.subtitle))}</Text>
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
                  [styles.contentText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }],
                  "fallo-summary"
                )}
              </View>
            ) : null}
          </View>
        );
      }

      return renderHighlightedBlock(
        extractedRelated.mainText,
        [styles.contentText, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }],
        "main-text"
      );
    }

    return <ContentUnavailableCard reason={document.contentUnavailableReason} />;
  };

  const renderDocSearchBar = (floating = false) => (
    <View style={[styles.docSearchBar, floating ? styles.docSearchBarFloating : null]}>
      <Text style={styles.docSearchIcon}>⌕</Text>
      <TextInput
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
        >
          <Text style={styles.docSearchClearBtnText}>×</Text>
        </Pressable>
      ) : null}
      {articleSearchMatches.length > 0 ? (
        <View style={styles.docSearchNav}>
          <Pressable style={styles.docSearchNavBtn} onPress={goToPrevSearchMatch}>
            <Text style={styles.docSearchNavBtnText}>‹</Text>
          </Pressable>
          <Pressable style={styles.docSearchNavBtn} onPress={goToNextSearchMatch}>
            <Text style={styles.docSearchNavBtnText}>›</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.zoomControls}>
        <Pressable style={styles.zoomBtn} onPress={zoomOut}>
          <Text style={styles.zoomBtnText}>A-</Text>
        </Pressable>
        <Pressable style={styles.zoomBtn} onPress={zoomIn}>
          <Text style={styles.zoomBtnText}>A+</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, selectedSection === "texto" ? { paddingTop: spacing.md + stickySearchHeight + 8 } : null]}
        onLayout={(event) => {
          scrollViewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => handleDetailScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={48}
        onContentSizeChange={(_, contentHeight) => {
          scrollContentHeightRef.current = contentHeight;
          restoreSavedScrollIfNeeded();
        }}
      >
        <DetailHeader title={document.title} subtitle={subtitleText} />

        <View style={styles.metaCard}>
          <MetadataRow label="Tipo" value={typeLabel} />
          <MetadataRow label={secondaryMeta.label} value={secondaryMeta.value} valueColor={secondaryMeta.color} />
        </View>

        {attachmentUrl ? (
          <Pressable
            style={styles.attachmentButton}
            onPress={() => Linking.openURL(attachmentUrl)}
          >
            <Text style={styles.attachmentButtonText}>{attachmentLabel}</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionTabs}>
          {sectionItems.map((item) => (
            <Pressable
              key={item.key}
              style={[styles.sectionTab, selectedSection === item.key ? styles.sectionTabActive : null]}
              onPress={() => setActiveSectionSafe(item.key)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.sectionTabText, selectedSection === item.key ? styles.sectionTabTextActive : null]}>
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

        {selectedSection === "texto" ? renderContent() : null}

        {selectedSection === "normasComplementarias" && normasComplementarias.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Normas complementarias</Text>
            {normasComplementarias.map((item, index) => (
              <Pressable
                key={`normas-comp-${index}-${item.title}-${item.guid || "na"}`}
                style={styles.relatedLinkButton}
                onPress={() => openRelatedContent(item)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(item.title))}</Text>
                {item.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(item.subtitle))}</Text>
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
                style={styles.relatedLinkButton}
                onPress={() => openRelatedContent(item)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(item.title))}</Text>
                {item.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(item.subtitle))}</Text>
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
                style={styles.relatedLinkButton}
                onPress={() => openRelatedContent(item)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(item.title))}</Text>
                {item.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(item.subtitle))}</Text>
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
                style={styles.relatedLinkButton}
                onPress={() => openRelatedContent(item)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(item.title))}</Text>
                {item.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(item.subtitle))}</Text>
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
                style={styles.relatedLinkButton}
                onPress={() => openRelatedFallo(fallo)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(prettifyNormLabel(fallo.title))}</Text>
                {fallo.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(prettifyNormLabel(fallo.subtitle))}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {selectedSection === "texto" ? (
        <View pointerEvents="box-none" style={[styles.floatingDocSearchWrap, { top: stickySearchTop }]}>
          <View>{renderDocSearchBar(true)}</View>
        </View>
      ) : null}
      {selectedSection === "texto" && stickySectionLabel ? (
        <View
          pointerEvents="none"
          style={[
            styles.stickySectionWrap,
            {
              top: stickySectionTop,
              transform: [{ translateY: stickySectionTranslateY }],
            },
          ]}
        >
          <Text style={[styles.stickySectionText, { fontSize: Math.max(13, bodyFontSize - 0.2) }]}>
            {stickySectionLabel}
          </Text>
        </View>
      ) : null}
      {selectedSection === "texto" && searchableArticles.length > 0 ? (
        <View
          style={[styles.articleScrubberTrack, isScrubbingArticles ? styles.articleScrubberTrackActive : null]}
          onLayout={(event) => setScrubberHeight(event.nativeEvent.layout.height)}
          {...articleScrubberResponder.panHandlers}
        >
          <View style={styles.articleScrubberGrip} />
          {isScrubbingArticles && activeArticlePreviewLabel ? (
            <View
              style={[
                styles.scrubberPreviewBubble,
                { top: scrubberPreviewTop },
              ]}
            >
              <Text style={styles.scrubberPreviewText}>{activeArticlePreviewLabel}</Text>
              <View style={styles.scrubberPreviewTail} />
            </View>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.md,
    gap: spacing.md,
  },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
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
  sectionTabText: {
    color: colors.muted,
    fontSize: typography.small + 1,
    fontWeight: "600",
  },
  sectionTabTextActive: {
    color: colors.primaryStrong,
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
  docSearchBarFloating: {
    borderColor: "#BFD0FF",
  },
  floatingDocSearchWrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md + 18,
    top: spacing.sm,
    zIndex: 20,
  },
  stickySectionWrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md + 18,
    backgroundColor: "#EEF3FF",
    borderColor: "#D6E2FF",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    zIndex: 19,
  },
  stickySectionText: {
    color: colors.primaryStrong,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
    lineHeight: 17,
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
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 2,
  },
  zoomBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#F5F7FC",
    minWidth: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  zoomBtnText: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
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
  relatedSection: {
    gap: spacing.sm,
  },
  relatedTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    color: colors.text,
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
    fontSize: typography.body,
    fontWeight: "700",
  },
  relatedLinkSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
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
    fontSize: typography.body,
    color: colors.text,
    lineHeight: 21,
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
    fontSize: typography.subtitle,
    fontWeight: "700",
    color: colors.text,
    textTransform: "uppercase",
  },
  contentText: {
    fontSize: typography.body - 1,
    color: colors.text,
    lineHeight: 19,
  },
  searchHighlight: {
    backgroundColor: "#FFE08A",
    color: colors.text,
  },
  articles: {
    gap: spacing.sm,
  },
  articleBlock: {
    gap: spacing.sm,
  },
  sectionHeading: {
    color: colors.primary,
    fontSize: typography.subtitle + 2,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  articleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
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
    fontWeight: "700",
    color: colors.text,
  },
  articleText: {
    fontSize: typography.body - 1,
    color: colors.text,
    lineHeight: 19,
  },
  articleScrubberTrack: {
    position: "absolute",
    top: spacing.xl + 72,
    bottom: spacing.xl + 12,
    right: 1,
    width: 10,
    borderRadius: 7,
    backgroundColor: "rgba(22, 40, 84, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(22, 40, 84, 0.14)",
    justifyContent: "center",
    alignItems: "center",
  },
  articleScrubberTrackActive: {
    backgroundColor: "rgba(37, 82, 224, 0.2)",
    borderColor: "rgba(37, 82, 224, 0.45)",
  },
  articleScrubberGrip: {
    width: 2,
    height: 24,
    borderRadius: 2,
    backgroundColor: "rgba(22, 40, 84, 0.55)",
  },
  scrubberPreviewBubble: {
    position: "absolute",
    right: 18,
    minWidth: 132,
    height: 52,
    backgroundColor: "#39BDF3",
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  scrubberPreviewText: {
    color: "#FFFFFF",
    fontSize: typography.subtitle + 6,
    fontWeight: "500",
  },
  scrubberPreviewTail: {
    position: "absolute",
    right: -6,
    width: 6,
    height: 24,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: "#39BDF3",
  },
});














