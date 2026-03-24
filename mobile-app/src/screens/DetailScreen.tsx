import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
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
  value = value.replace(/\[\[\/?[a-z]+\]\]|\[\/?[a-z]+\]/gi, "\n");
  value = value.replace(/[ \t]+\n/g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  value = value.replace(/[ \t]{2,}/g, " ");
  return value.trim();
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
  const metadataDateRaw = getMetadataDate(document.metadata);
  const metadataDate = metadataDateRaw ? formatDate(metadataDateRaw) || metadataDateRaw : null;

  const contentWidth = Math.max(0, width - spacing.md * 2);
  const subtitleText = getSubtitleText(document.subtitle);

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
            return (
              <View key={`${article.number || index}`} style={styles.articleBlock}>
                {headingLines.map((heading, headingIndex) => (
                  <Text key={`${article.number || index}-h-${headingIndex}`} style={styles.sectionHeading}>
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

    const cleanedText = cleanContentText(document.contentText);
    if (cleanedText) {
      return <Text style={styles.contentText}>{cleanedText}</Text>;
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






