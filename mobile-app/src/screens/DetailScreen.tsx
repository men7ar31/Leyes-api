import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
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
  contentTypeHint?: "legislacion" | "fallo" | "sumario" | "dictamen" | "doctrina" | "todo" | "unknown";
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  if (!trimmed || !articleNumber || typeof articleNumber !== "string") return trimmed;
  const escapedNumber = escapeRegExp(articleNumber.trim());
  if (!escapedNumber) return trimmed;
  const pattern = new RegExp(
    `^[\"“”'\\s]*?(?:ART[ÍI]CULO|ART\\.?)\\s*${escapedNumber}\\s*(?:°|º|o)?\\s*[\\.:\\-–—]*\\s*`,
    "i"
  );
  const cleaned = trimmed.replace(pattern, "").trimStart();
  return cleaned.length > 0 ? cleaned : trimmed;
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

export const DetailScreen = () => {
  const params = useLocalSearchParams<{ guid?: string }>();
  const guidParam = Array.isArray(params.guid) ? params.guid[0] : params.guid;

  const { document, isLoading, isError, error, refetch } = useSaijDocument(guidParam);
  const { width } = useWindowDimensions();
  const [activeSection, setActiveSection] = useState<string>("texto");
  const [expandedArticlePanels, setExpandedArticlePanels] = useState<Record<string, boolean>>({});
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [searchMatchPointer, setSearchMatchPointer] = useState(0);
  const [activeArticlePreviewIndex, setActiveArticlePreviewIndex] = useState<number>(-1);
  const scrollRef = useRef<ScrollView | null>(null);
  const articleOffsetsRef = useRef<Record<number, number>>({});
  const scrollOffsetRef = useRef(0);
  const restorePendingRef = useRef(false);

  const toggleArticlePanel = (key: string) => {
    setExpandedArticlePanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  const sourceUrl = document.sourceUrl || document.friendlyUrl;
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
  const articleSearchMatches = useMemo(() => {
    if (!normalizedSearchQuery || !searchableArticles.length) return [] as number[];
    const hits: number[] = [];
    searchableArticles.forEach((article, index) => {
      const haystack = `${article.number || ""} ${article.title || ""} ${article.text || ""}`.toLowerCase();
      if (haystack.includes(normalizedSearchQuery)) hits.push(index);
    });
    return hits;
  }, [normalizedSearchQuery, searchableArticles]);
  const articleSearchMatchSet = useMemo(() => new Set(articleSearchMatches), [articleSearchMatches]);
  const plainTextSearchMatches = useMemo(() => {
    if (!normalizedSearchQuery || searchableArticles.length > 0) return 0;
    const fallbackText = `${leadText || ""}\n${extractedRelated.mainText || ""}`;
    return countMatchesInText(fallbackText, normalizedSearchQuery);
  }, [normalizedSearchQuery, searchableArticles.length, leadText, extractedRelated.mainText]);
  const totalSearchMatches =
    searchableArticles.length > 0 ? articleSearchMatches.length : plainTextSearchMatches;

  const jumpToY = (y: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ y: Math.max(0, y - 130), animated: true });
  };

  const jumpToArticleByIndex = (articleIndex: number) => {
    const y = articleOffsetsRef.current[articleIndex];
    if (typeof y === "number") jumpToY(y);
  };

  const updateActiveArticleByScroll = (offsetY: number) => {
    if (!searchableArticles.length) {
      setActiveArticlePreviewIndex(-1);
      return;
    }
    const thresholdY = offsetY + 180;
    const pairs = Object.entries(articleOffsetsRef.current)
      .map(([idx, y]) => ({ idx: Number(idx), y: Number(y) }))
      .filter((item) => Number.isFinite(item.idx) && Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);
    if (!pairs.length) return;
    let active = pairs[0].idx;
    for (const pair of pairs) {
      if (pair.y <= thresholdY) active = pair.idx;
      else break;
    }
    setActiveArticlePreviewIndex(active);
  };

  const goToNextSearchMatch = () => {
    if (!articleSearchMatches.length) return;
    const nextPointer = (searchMatchPointer + 1) % articleSearchMatches.length;
    setSearchMatchPointer(nextPointer);
    jumpToArticleByIndex(articleSearchMatches[nextPointer]);
  };

  const goToPrevSearchMatch = () => {
    if (!articleSearchMatches.length) return;
    const nextPointer =
      (searchMatchPointer - 1 + articleSearchMatches.length) % articleSearchMatches.length;
    setSearchMatchPointer(nextPointer);
    jumpToArticleByIndex(articleSearchMatches[nextPointer]);
  };

  useEffect(() => {
    setSearchMatchPointer(0);
  }, [normalizedSearchQuery, articleSearchMatches.length, plainTextSearchMatches]);

  useEffect(() => {
    articleOffsetsRef.current = {};
    setActiveArticlePreviewIndex(-1);
  }, [document.guid, searchableArticles.length]);

  useEffect(() => {
    if (!document?.guid) return;
    if (restorePendingRef.current) return;
    const saved = DETAIL_SCROLL_OFFSET_BY_GUID[document.guid];
    if (typeof saved !== "number" || saved <= 0) return;
    restorePendingRef.current = true;
    const timer = setTimeout(() => {
      jumpToY(saved);
      restorePendingRef.current = false;
    }, 60);
    return () => clearTimeout(timer);
  }, [document.guid]);

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
          baseStyle={styles.contentText}
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
            const articleNormasQueModifica = Array.isArray(article.normasQueModifica) ? article.normasQueModifica : [];
            const articleNormasComplementarias = Array.isArray(article.normasComplementarias) ? article.normasComplementarias : [];
            const articleObservaciones = Array.isArray(article.observaciones) ? article.observaciones : [];
            const articleNormasQueModificaFinal = dedupeRelatedByTitle(articleNormasQueModifica as RelatedContentItem[]);
            const articleNormasComplementariasFinal = dedupeRelatedByTitle(articleNormasComplementarias as RelatedContentItem[]);
            const articleObservacionesFinal = dedupeRelatedByTitle(articleObservaciones as RelatedContentItem[]);
            const parsedTitle = parseArticleTitleContext(article.title);
            const headingLines = getNewHeadingLines(parsedTitle.headings, previousHeadings);
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
            return (
              <View key={articleKey} style={styles.articleBlock}>
                {headingLines.map((heading, headingIndex) => (
                  <Text key={`${articleKey}-h-${headingIndex}`} style={styles.sectionHeading}>
                    {cleanText(heading)}
                  </Text>
                ))}
                <View style={styles.articleCard}>
                  <Text style={styles.articleTitle}>
                    {article.number ? `Articulo ${article.number}` : "Articulo"}
                    {parsedTitle.articleLabel ? ` - ${cleanText(parsedTitle.articleLabel)}` : ""}
                  </Text>
                  <Text style={styles.articleText}>{articleTextWithoutDuplicateLabel}</Text>
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
                    isPrimary ? styles.falloHeaderPrimary : null,
                    isMetaLabel ? styles.falloHeaderMeta : null,
                  ]}
                >
                  {line}
                </Text>
              );
            })}
            {parsed.summaryText ? (
              <View style={styles.falloSummarySection}>
                <Text style={styles.falloSummaryTitle}>Sumario</Text>
                <Text style={styles.contentText}>{parsed.summaryText}</Text>
              </View>
            ) : null}
          </View>
        );
      }

      return <Text style={styles.contentText}>{extractedRelated.mainText}</Text>;
    }

    return <ContentUnavailableCard reason={document.contentUnavailableReason} />;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <DetailHeader title={document.title} subtitle={subtitleText} />

        <View style={styles.metaCard}>
          <MetadataRow label="Tipo" value={typeLabel} />
          <MetadataRow label={secondaryMeta.label} value={secondaryMeta.value} valueColor={secondaryMeta.color} />
        </View>

        <Pressable
          style={[styles.sourceButton, !sourceUrl ? styles.sourceButtonDisabled : null]}
          onPress={() => (sourceUrl ? Linking.openURL(sourceUrl) : null)}
          disabled={!sourceUrl}
        >
          <Text style={styles.sourceButtonText}>Abrir fuente</Text>
        </Pressable>

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
              onPress={() => setActiveSection(item.key)}
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
            <Text style={styles.articleText}>{leadText}</Text>
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
  sourceButton: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  sourceButtonDisabled: {
    opacity: 0.6,
  },
  sourceButtonText: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "600",
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
    fontSize: typography.body,
    color: colors.text,
    lineHeight: 20,
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
  articleText: {
    fontSize: typography.body,
    color: colors.text,
    lineHeight: 20,
  },
});












