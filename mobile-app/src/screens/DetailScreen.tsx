import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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

export const DetailScreen = () => {
  const params = useLocalSearchParams<{ guid?: string }>();
  const guidParam = Array.isArray(params.guid) ? params.guid[0] : params.guid;

  const { document, isLoading, isError, error, refetch } = useSaijDocument(guidParam);
  const { width } = useWindowDimensions();

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
  const relatedFallos = Array.isArray(document.relatedFallos) ? document.relatedFallos : [];
  const metadataDateRaw = getMetadataDate(document.metadata);
  const metadataDate = metadataDateRaw ? formatDate(metadataDateRaw) || metadataDateRaw : null;

  const contentWidth = Math.max(0, width - spacing.md * 2);
  const subtitleText = getSubtitleText(document.subtitle);
  const cleanedContentText = cleanContentText(document.contentText);
  const extractedRelated =
    document.contentType === "sumario"
      ? extractRelatedContentBlock(cleanedContentText)
      : { mainText: cleanedContentText, relatedItems: [] as string[] };
  const relatedContentItems = extractedRelated.relatedItems;
  const openRelatedFallo = async (fallo: { title: string; guid?: string | null }) => {
    const directGuid = typeof fallo.guid === "string" ? fallo.guid.trim() : "";
    if (directGuid) {
      router.push({ pathname: "/detail/[guid]", params: { guid: directGuid } });
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

  const openRelatedContent = async (line: string) => {
    const leyMatch = line.match(/ley\s+(\d{2,7})/i);
    const numeroNorma = leyMatch?.[1]?.trim();
    const cleanedLine = line.replace(/\s+/g, " ").trim();
    const tokens = cleanedLine.split(" ").filter((token) => token.length > 2);
    const attempts = Array.from(
      new Set(
        [
          cleanedLine,
          tokens[0],
          tokens[1],
          tokens[0] && tokens[1] ? `${tokens[0]} ${tokens[1]}` : null,
        ].filter((value): value is string => Boolean(value && value.trim().length > 0))
      )
    );

    try {
      if (numeroNorma) {
        const byNumber = await searchSaij({
          contentType: "legislacion",
          filters: {
            numeroNorma,
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

      for (const term of attempts) {
        const response = await searchSaij({
          contentType: "legislacion",
          filters: {
            textoEnNorma: term,
            jurisdiccion: { kind: "todas" },
          },
          offset: 0,
          pageSize: 10,
        });
        const first = response.hits.find((hit) => hit.contentType === "legislacion") || response.hits[0];
        const guid = typeof first?.guid === "string" ? first.guid.trim() : "";
        if (guid) {
          router.push({ pathname: "/detail/[guid]", params: { guid } });
          return;
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
            const parsedTitle = parseArticleTitleContext(article.title);
            const headingLines = getNewHeadingLines(parsedTitle.headings, previousHeadings);
            previousHeadings = parsedTitle.headings;
            const articleKey = `${index}-${article.number || "na"}`;
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
                  <Text style={styles.articleText}>{articleText}</Text>
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
          <MetadataRow label="Tipo" value={document.contentType} />
          <MetadataRow label="Fecha" value={metadataDate} />
          {document.fromCache ? <MetadataRow label="Cache" value="Si" /> : null}
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

        {renderContent()}

        {document.contentType === "sumario" && relatedContentItems.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Contenido relacionado</Text>
            {relatedContentItems.map((item, index) => (
              <Pressable
                key={`${index}-${item}`}
                style={styles.relatedLinkButton}
                onPress={() => openRelatedContent(item)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(item)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {relatedFallos.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>Fallos a los que aplica</Text>
            {relatedFallos.map((fallo, index) => (
              <Pressable
                key={`${index}-${fallo.title}`}
                style={styles.relatedLinkButton}
                onPress={() => openRelatedFallo(fallo)}
              >
                <Text style={styles.relatedLinkTitle}>{cleanText(fallo.title)}</Text>
                {fallo.subtitle ? (
                  <Text style={styles.relatedLinkSubtitle}>{cleanText(fallo.subtitle)}</Text>
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









