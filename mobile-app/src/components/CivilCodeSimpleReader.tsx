import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListProps,
  type PanResponderInstance,
  type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";
import { getReadingBodyMetrics, readingTypography } from "../theme/readingTypography";
import type { SaijDocument } from "../types/saij";
import {
  buildCivilCodeArticleNavigationMap,
  buildCivilCodeReaderModel,
  getCivilCodeArticlePointerFromRatio,
  getCivilCodeArticleRatio,
  normalizeCivilCodeSearchText,
  type CivilCodeArticleNavigationItem,
  type CivilCodeSimpleSection,
  type CivilCodeStructureItem,
} from "../utils/civilCodeReader";

type Props = {
  document: SaijDocument;
};

const HIGHLIGHT_MIN_QUERY_LENGTH = 2;
const SCRUBBER_THUMB_HEIGHT = 44;
const SCRUBBER_TOUCH_PADDING = 18;
const LIST_TOP_PADDING = spacing.md;
const LIST_BOTTOM_PADDING = spacing.xl * 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const countOccurrences = (haystack: string, needle: string) => {
  if (!haystack || !needle) return 0;

  let count = 0;
  let cursor = 0;
  while (cursor < haystack.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + needle.length;
  }

  return count;
};

const buildHighlightIndexMap = (text: string) => {
  const normalizedChars: string[] = [];
  const sourceIndexMap: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const normalizedChar = text[index]
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (!normalizedChar) continue;

    for (const char of normalizedChar) {
      normalizedChars.push(char);
      sourceIndexMap.push(index);
    }
  }

  return {
    normalized: normalizedChars.join(""),
    sourceIndexMap,
  };
};

const getHighlightedParts = (text: string, query: string) => {
  const source = String(text || "");
  const needle = normalizeCivilCodeSearchText(query);
  if (!source) return [{ text: "", hit: false }];
  if (needle.length < HIGHLIGHT_MIN_QUERY_LENGTH) return [{ text: source, hit: false }];

  const { normalized, sourceIndexMap } = buildHighlightIndexMap(source);
  if (!normalized || sourceIndexMap.length < 1) return [{ text: source, hit: false }];

  const parts: Array<{ text: string; hit: boolean }> = [];
  let normalizedCursor = 0;
  let sourceCursor = 0;

  while (normalizedCursor < normalized.length) {
    const index = normalized.indexOf(needle, normalizedCursor);
    if (index < 0) {
      parts.push({ text: source.slice(sourceCursor), hit: false });
      break;
    }

    const sourceStart = sourceIndexMap[index] ?? sourceCursor;
    const sourceEndExclusive = (sourceIndexMap[index + needle.length - 1] ?? sourceStart) + 1;

    if (sourceStart > sourceCursor) {
      parts.push({ text: source.slice(sourceCursor, sourceStart), hit: false });
    }

    parts.push({ text: source.slice(sourceStart, sourceEndExclusive), hit: true });
    normalizedCursor = index + needle.length;
    sourceCursor = sourceEndExclusive;
  }

  return parts.length ? parts : [{ text: source, hit: false }];
};

const getDisplayArticleHeaderAndBody = (section: CivilCodeSimpleSection) => {
  const explicitTitle = section.articleTitleText?.trim() || "";
  const originalBody = String(section.bodyText || "").trim();

  if (explicitTitle) {
    return {
      articleTitle: explicitTitle,
      bodyText: originalBody,
    };
  }

  const firstSentenceMatch = originalBody.match(/^([^\n.]{3,180})\.\s+([\s\S]+)$/);
  if (!firstSentenceMatch?.[1] || !firstSentenceMatch?.[2]) {
    return {
      articleTitle: "",
      bodyText: originalBody,
    };
  }

  const articleTitle = firstSentenceMatch[1].trim();
  const bodyText = firstSentenceMatch[2].trim();
  if (!articleTitle || !bodyText) {
    return {
      articleTitle: "",
      bodyText: originalBody,
    };
  }

  return {
    articleTitle,
    bodyText,
  };
};

type RowProps = {
  section: CivilCodeSimpleSection;
  query: string;
  isActiveMatch: boolean;
  isDarkMode: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
  bodyFontSize: number;
  bodyLineHeight: number;
};

const ReaderRow = memo(
  ({ section, query, isActiveMatch, isDarkMode, colors, bodyFontSize, bodyLineHeight }: RowProps) => {
    const articleDisplay = section.kind === "article" ? getDisplayArticleHeaderAndBody(section) : null;
    const headingParts = getHighlightedParts(section.headingText, query);
    const bodyText = articleDisplay?.bodyText ?? section.bodyText;
    const bodyParts = getHighlightedParts(bodyText, query);
    const articleLabel = section.articleNumber ? `Articulo ${section.articleNumber}` : section.headingText;
    const articleTitle = articleDisplay?.articleTitle ?? "";
    const articleTitleDisplay = articleTitle
      ? `.- ${/[.!?]$/.test(articleTitle) ? articleTitle : `${articleTitle}.`}`
      : "";
    const articleHeadingDisplay = articleTitleDisplay ? `${articleLabel} ${articleTitleDisplay}` : articleLabel;
    const articleHeadingParts = getHighlightedParts(articleHeadingDisplay, query);

    return (
      <View
        style={[
          styles.sectionRow,
          {
            borderBottomColor: colors.border,
            backgroundColor: isActiveMatch ? (isDarkMode ? "#1D2A40" : "#F6F9FF") : colors.background,
          },
        ]}
      >
        {section.kind === "article" ? (
          <>
            <Text style={[styles.articleHeading, { color: colors.text }]}>
              {articleHeadingParts.map((part, index) => (
                <Text
                  key={`${section.key}-heading-${index}`}
                  style={part.hit ? [styles.highlight, { backgroundColor: "#FFE08A" }] : undefined}
                >
                  {part.text}
                </Text>
              ))}
            </Text>
            {bodyText ? (
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.text,
                    fontSize: bodyFontSize,
                    lineHeight: bodyLineHeight,
                  },
                ]}
              >
                {bodyParts.map((part, index) => (
                  <Text
                    key={`${section.key}-body-${index}`}
                    style={part.hit ? [styles.highlight, { backgroundColor: "#FFE08A" }] : undefined}
                  >
                    {part.text}
                  </Text>
                ))}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.primaryStrong }]}>{section.headingText}</Text>
            <Text
              style={[
                styles.sectionBody,
                {
                  color: colors.text,
                  fontSize: bodyFontSize,
                  lineHeight: bodyLineHeight,
                },
              ]}
            >
              {bodyParts.map((part, index) => (
                <Text
                  key={`${section.key}-body-${index}`}
                  style={part.hit ? [styles.highlight, { backgroundColor: "#FFE08A" }] : undefined}
                >
                  {part.text}
                </Text>
              ))}
            </Text>
          </>
        )}
      </View>
    );
  }
);

ReaderRow.displayName = "ReaderRow";

export const CivilCodeSimpleReader = ({ document }: Props) => {
  const { colors, isDarkMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [activeMatchPointer, setActiveMatchPointer] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isStructureIndexOpen, setIsStructureIndexOpen] = useState(false);
  const [activeArticlePointer, setActiveArticlePointer] = useState(0);
  const [previewArticlePointer, setPreviewArticlePointer] = useState<number | null>(null);
  const [scrubberHeight, setScrubberHeight] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<FlatList<CivilCodeSimpleSection> | null>(null);
  const structureListRef = useRef<FlatList<CivilCodeStructureItem> | null>(null);
  const scrubberTrackRef = useRef<View | null>(null);
  const sectionLayoutsRef = useRef<Record<number, { height: number }>>({});
  const isScrubbingRef = useRef(false);
  const previewArticlePointerRef = useRef<number | null>(null);
  const deferredNormalizedQuery = normalizeCivilCodeSearchText(deferredQuery);
  const { fontSize: bodyFontSize, lineHeight: bodyLineHeight } = getReadingBodyMetrics(0.94);

  const readerModel = useMemo(
    () => buildCivilCodeReaderModel(document),
    [document.guid, document.fetchedAt, document.articles?.length, document.contentText, document.headerText]
  );
  const sections = readerModel.sections;
  const structureItems = readerModel.structureItems;

  const articleNavItems = useMemo<CivilCodeArticleNavigationItem[]>(
    () => buildCivilCodeArticleNavigationMap(sections),
    [sections]
  );

  const estimatedSectionHeights = useMemo(() => {
    const bodyCharsPerLine = 46;
    const headingCharsPerLine = 28;

    return sections.map((section) => {
      const headingLines = Math.max(1, Math.ceil((section.headingText?.length || 0) / headingCharsPerLine));
      const bodyParagraphs = String(section.bodyText || "")
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const bodyLines =
        bodyParagraphs.reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / bodyCharsPerLine)), 0) +
        Math.max(0, bodyParagraphs.length - 1);
      const topAndBottom = spacing.sm * 2;
      const gapHeight = spacing.xs;

      if (section.kind === "article") {
        return topAndBottom + headingLines * readingTypography.articleLeadLineHeight + gapHeight + bodyLines * bodyLineHeight;
      }

      const labelLines = Math.max(1, Math.ceil((section.headingText?.length || 0) / headingCharsPerLine));
      return topAndBottom + labelLines * readingTypography.sectionLabelLineHeight + gapHeight + bodyLines * bodyLineHeight;
    });
  }, [bodyLineHeight, sections]);

  const estimatedSectionOffsets = useMemo(() => {
    let cursor = LIST_TOP_PADDING;
    return estimatedSectionHeights.map((height) => {
      const offset = cursor;
      cursor += height;
      return offset;
    });
  }, [estimatedSectionHeights]);

  const articleEstimatedOffsets = useMemo(
    () => articleNavItems.map((item) => estimatedSectionOffsets[item.sectionIndex] ?? LIST_TOP_PADDING),
    [articleNavItems, estimatedSectionOffsets]
  );

  const sectionIndexToArticlePointer = useMemo(() => {
    const mapping = new Map<number, number>();
    articleNavItems.forEach((item, pointer) => {
      mapping.set(item.sectionIndex, pointer);
    });
    return mapping;
  }, [articleNavItems]);

  const articlePointerRef = useRef(sectionIndexToArticlePointer);
  const scrubberTrackPageYRef = useRef(0);
  const scrubberTrackPageYValidRef = useRef(false);
  const scrubberDragOffsetRef = useRef(0);
  useEffect(() => {
    articlePointerRef.current = sectionIndexToArticlePointer;
  }, [sectionIndexToArticlePointer]);

  const lastScrubPointerRef = useRef(-1);

  useEffect(() => {
    setActiveArticlePointer(0);
    setPreviewArticlePointer(null);
    lastScrubPointerRef.current = -1;
    previewArticlePointerRef.current = null;
    sectionLayoutsRef.current = {};
  }, [document.guid]);

  const effectiveArticlePointer =
    isScrubbing && typeof previewArticlePointer === "number" ? previewArticlePointer : activeArticlePointer;
  const previewArticle = articleNavItems[effectiveArticlePointer] || null;
  const effectiveScrubberRatio = getCivilCodeArticleRatio(effectiveArticlePointer, articleNavItems.length);

  const currentStructurePointer = useMemo(() => {
    if (structureItems.length < 1) return -1;

    let pointer = 0;
    for (let index = 0; index < structureItems.length; index += 1) {
      if (structureItems[index].articlePointer <= effectiveArticlePointer) {
        pointer = index;
      } else {
        break;
      }
    }
    return pointer;
  }, [effectiveArticlePointer, structureItems]);

  const currentStructure = currentStructurePointer >= 0 ? structureItems[currentStructurePointer] : null;

  useEffect(() => {
    if (currentStructurePointer < 0) return;
    structureListRef.current?.scrollToIndex({
      index: currentStructurePointer,
      animated: true,
      viewPosition: 0.5,
    });
  }, [currentStructurePointer]);

  const matchSectionIndices = useMemo(() => {
    if (deferredNormalizedQuery.length < HIGHLIGHT_MIN_QUERY_LENGTH) return [] as number[];

    const matches: number[] = [];
    for (let index = 0; index < sections.length; index += 1) {
      if (sections[index].searchText.includes(deferredNormalizedQuery)) matches.push(index);
    }
    return matches;
  }, [deferredNormalizedQuery, sections]);

  const totalOccurrenceCount = useMemo(() => {
    if (deferredNormalizedQuery.length < HIGHLIGHT_MIN_QUERY_LENGTH) return 0;
    return sections.reduce(
      (count, section) => count + countOccurrences(section.searchText, deferredNormalizedQuery),
      0
    );
  }, [deferredNormalizedQuery, sections]);

  useEffect(() => {
    setActiveMatchPointer(0);
  }, [deferredNormalizedQuery]);

  const safeMatchPointer =
    matchSectionIndices.length > 0 ? Math.min(activeMatchPointer, matchSectionIndices.length - 1) : 0;

  const scrollToSection = (index: number, animated = true) => {
    if (index < 0 || index >= sections.length) return;
    const offset = estimateSectionOffset(index);
    listRef.current?.scrollToOffset({ offset: Math.max(0, offset), animated });
  };

  const jumpToArticleAnchor = (pointer: number) => {
    const target = articleNavItems[pointer];
    if (!target) return;

    setActiveArticlePointer(pointer);
    listRef.current?.scrollToOffset({
      offset: Math.max(0, estimateSectionOffset(target.sectionIndex)),
      animated: false,
    });
  };

  const scrollToStructure = (item?: CivilCodeStructureItem | null) => {
    if (!item) return;
    setActiveArticlePointer(item.articlePointer);
    scrollToSection(item.sectionIndex);
  };

  const goToPrevStructure = () => {
    if (currentStructurePointer <= 0) return;
    scrollToStructure(structureItems[currentStructurePointer - 1]);
  };

  const goToNextStructure = () => {
    if (currentStructurePointer < 0 || currentStructurePointer >= structureItems.length - 1) return;
    scrollToStructure(structureItems[currentStructurePointer + 1]);
  };

  const goToCurrentMatch = (pointer: number) => {
    const sectionIndex = matchSectionIndices[pointer];
    if (typeof sectionIndex === "number") scrollToSection(sectionIndex);
  };

  const goToNextMatch = () => {
    if (matchSectionIndices.length < 1) return;
    const nextPointer = (safeMatchPointer + 1) % matchSectionIndices.length;
    setActiveMatchPointer(nextPointer);
    goToCurrentMatch(nextPointer);
  };

  const goToPrevMatch = () => {
    if (matchSectionIndices.length < 1) return;
    const nextPointer = (safeMatchPointer - 1 + matchSectionIndices.length) % matchSectionIndices.length;
    setActiveMatchPointer(nextPointer);
    goToCurrentMatch(nextPointer);
  };

  const onScrollToIndexFailed: FlatListProps<CivilCodeSimpleSection>["onScrollToIndexFailed"] = (info) => {
    listRef.current?.scrollToOffset({
      offset: Math.max(0, estimateSectionOffset(info.index)),
      animated: false,
    });
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken<CivilCodeSimpleSection>> }) => {
      if (isScrubbingRef.current) return;

      const sectionIndices = viewableItems
        .map((item) => item.index)
        .filter((item): item is number => typeof item === "number")
        .sort((a, b) => a - b);

      const nextVisibleArticleSection = sectionIndices.find((sectionIndex) => articlePointerRef.current.has(sectionIndex));
      if (typeof nextVisibleArticleSection !== "number") return;

      const nextPointer = articlePointerRef.current.get(nextVisibleArticleSection) ?? 0;
      setActiveArticlePointer((current) => (current === nextPointer ? current : nextPointer));
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 18 }).current;

  const recordSectionLayout = (index: number, y: number, height: number) => {
    if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return;
    sectionLayoutsRef.current[index] = { height };
  };

  const estimateSectionOffset = (index: number) => estimatedSectionOffsets[index] ?? LIST_TOP_PADDING;

  const getTargetFromSidebarRatio = (ratio: number) =>
    getCivilCodeArticlePointerFromRatio(ratio, articleNavItems.length);

  const scrubToLocation = (locationY: number) => {
    if (articleNavItems.length < 1 || scrubberHeight <= 0) return;

    const thumbHalf = SCRUBBER_THUMB_HEIGHT / 2;
    const travel = Math.max(1, scrubberHeight - SCRUBBER_THUMB_HEIGHT);
    const clampedCenter = Math.max(thumbHalf, Math.min(locationY, scrubberHeight - thumbHalf));
    const ratio = (clampedCenter - thumbHalf) / travel;
    const pointer = getTargetFromSidebarRatio(ratio);

    if (pointer === lastScrubPointerRef.current) return;
    lastScrubPointerRef.current = pointer;
    previewArticlePointerRef.current = pointer;
    setPreviewArticlePointer(pointer);
  };

  const scrubberThumbTop = (() => {
    if (scrubberHeight <= 0) return 0;
    return effectiveScrubberRatio * Math.max(0, scrubberHeight - SCRUBBER_THUMB_HEIGHT);
  })();

  const updateScrubberTrackWindowPosition = () => {
    if (!scrubberTrackRef.current) return;
    scrubberTrackRef.current.measureInWindow((_, y) => {
      scrubberTrackPageYRef.current = y;
      scrubberTrackPageYValidRef.current = Number.isFinite(y);
    });
  };

  const getTrackYFromPageY = (pageY: number) => {
    if (!scrubberTrackPageYValidRef.current) return pageY;
    return pageY - scrubberTrackPageYRef.current;
  };

  const getThumbCenterY = () => scrubberThumbTop + SCRUBBER_THUMB_HEIGHT / 2;

  const handleScrubberLayout = (event: LayoutChangeEvent) => {
    setScrubberHeight(event.nativeEvent.layout.height);
    requestAnimationFrame(() => {
      updateScrubberTrackWindowPosition();
    });
  };

  const scrubberPanResponder = useMemo<PanResponderInstance>(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => articleNavItems.length > 0,
        onMoveShouldSetPanResponder: () => articleNavItems.length > 0,
        onPanResponderGrant: (event) => {
          setIsScrubbing(true);
          isScrubbingRef.current = true;
          previewArticlePointerRef.current = activeArticlePointer;
          setPreviewArticlePointer(activeArticlePointer);
          updateScrubberTrackWindowPosition();
          const trackY = getTrackYFromPageY(event.nativeEvent.pageY);
          const thumbCenter = getThumbCenterY();
          scrubberDragOffsetRef.current =
            Math.abs(trackY - thumbCenter) <= SCRUBBER_TOUCH_PADDING ? trackY - thumbCenter : 0;
          scrubToLocation(trackY - scrubberDragOffsetRef.current);
        },
        onPanResponderMove: (event) => {
          const trackY = getTrackYFromPageY(event.nativeEvent.pageY);
          scrubToLocation(trackY - scrubberDragOffsetRef.current);
        },
        onPanResponderRelease: (event) => {
          const trackY = getTrackYFromPageY(event.nativeEvent.pageY);
          scrubToLocation(trackY - scrubberDragOffsetRef.current);
          const targetPointer =
            typeof previewArticlePointerRef.current === "number"
              ? previewArticlePointerRef.current
              : getTargetFromSidebarRatio(effectiveScrubberRatio);
          jumpToArticleAnchor(targetPointer);
          setIsScrubbing(false);
          isScrubbingRef.current = false;
          setPreviewArticlePointer(null);
          previewArticlePointerRef.current = null;
          lastScrubPointerRef.current = -1;
          scrubberDragOffsetRef.current = 0;
        },
        onPanResponderTerminate: () => {
          setIsScrubbing(false);
          isScrubbingRef.current = false;
          setPreviewArticlePointer(null);
          previewArticlePointerRef.current = null;
          lastScrubPointerRef.current = -1;
          scrubberDragOffsetRef.current = 0;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [activeArticlePointer, articleNavItems.length, scrubberHeight, scrubberThumbTop]
  );

  const renderSection = ({ item, index }: { item: CivilCodeSimpleSection; index: number }) => (
    <View
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        recordSectionLayout(index, y, height);
      }}
    >
      <ReaderRow
        section={item}
        query={deferredQuery}
        isActiveMatch={matchSectionIndices[safeMatchPointer] === index}
        isDarkMode={isDarkMode}
        colors={colors}
        bodyFontSize={bodyFontSize}
        bodyLineHeight={bodyLineHeight}
      />
    </View>
  );

  const renderStructureItem = ({ item, index }: { item: CivilCodeStructureItem; index: number }) => {
    const isActive = index === currentStructurePointer;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.structureChip,
          {
            borderColor: isActive ? colors.primaryStrong : colors.border,
            backgroundColor: isActive ? (isDarkMode ? "#233B66" : "#E2EEFF") : colors.card,
          },
          pressed ? styles.iconButtonPressed : null,
        ]}
        onPress={() => scrollToStructure(item)}
      >
        <Text
          style={[
            styles.structureChipText,
            {
              color: isActive ? colors.primaryStrong : colors.text,
            },
          ]}
          numberOfLines={2}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  const searchStatus =
    matchSectionIndices.length > 0
      ? `${safeMatchPointer + 1}/${matchSectionIndices.length} bloques - ${totalOccurrenceCount} coincidencias`
      : query.trim()
        ? "Sin coincidencias"
        : `Fuente: ${readerModel.source}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.headerWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={colors.primaryStrong} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
              {document.title}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
            onPress={() => setIsSearchOpen((current) => !current)}
          >
            {isSearchOpen ? (
              <X size={19} color={colors.primaryStrong} strokeWidth={2} />
            ) : (
              <Search size={19} color={query.trim() ? colors.primaryStrong : colors.iconDefault} strokeWidth={2} />
            )}
          </Pressable>
        </View>

        <Pressable
          style={[styles.structureStrip, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => setIsStructureIndexOpen((current) => !current)}
        >
          <View style={styles.structureStripHeader}>
            <Text style={[styles.structureCaption, { color: colors.muted }]}>Titulo / Capitulo</Text>
            <View style={styles.structureStripActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.structureNavButton,
                  pressed ? styles.iconButtonPressed : null,
                  currentStructurePointer <= 0 ? styles.disabledButton : null,
                ]}
                onPress={goToPrevStructure}
                disabled={currentStructurePointer <= 0}
              >
                <ChevronLeft size={18} color={colors.primaryStrong} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.structureNavButton,
                  pressed ? styles.iconButtonPressed : null,
                  currentStructurePointer < 0 || currentStructurePointer >= structureItems.length - 1
                    ? styles.disabledButton
                    : null,
                ]}
                onPress={goToNextStructure}
                disabled={currentStructurePointer < 0 || currentStructurePointer >= structureItems.length - 1}
              >
                <ChevronRight size={18} color={colors.primaryStrong} strokeWidth={2.2} />
              </Pressable>
              <View style={styles.structureToggleIcon}>
                {isStructureIndexOpen ? (
                  <ChevronUp size={18} color={colors.primaryStrong} strokeWidth={2.2} />
                ) : (
                  <ChevronDown size={18} color={colors.primaryStrong} strokeWidth={2.2} />
                )}
              </View>
            </View>
          </View>
          <Text style={[styles.structureText, { color: colors.text }]} numberOfLines={2}>
            {currentStructure?.label || "Sin estructura detectada"}
          </Text>
          {isStructureIndexOpen && structureItems.length > 0 ? (
            <FlatList
              ref={structureListRef}
              data={structureItems}
              keyExtractor={(item) => item.key}
              renderItem={renderStructureItem}
              horizontal
              showsHorizontalScrollIndicator={false}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={() => {}}
              contentContainerStyle={styles.structureList}
            />
          ) : null}
        </Pressable>

        {isSearchOpen ? (
          <View style={[styles.searchShell, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.searchBar}>
              <Search size={16} color={colors.iconDefault} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar en el codigo"
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query ? (
                <Pressable
                  style={({ pressed }) => [styles.clearButton, pressed ? styles.iconButtonPressed : null]}
                  onPress={() => setQuery("")}
                >
                  <X size={16} color={colors.iconDefault} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.searchFooterRow}>
              <Text style={[styles.searchMeta, { color: colors.muted }]} numberOfLines={1}>
                {searchStatus}
              </Text>
              <View style={styles.searchNavButtons}>
                <Pressable
                  style={[
                    styles.searchNavButton,
                    { borderColor: colors.border },
                    matchSectionIndices.length < 1 ? styles.disabledButton : null,
                  ]}
                  onPress={goToPrevMatch}
                  disabled={matchSectionIndices.length < 1}
                >
                  <Text
                    style={[
                      styles.searchNavText,
                      { color: colors.primaryStrong },
                      matchSectionIndices.length < 1 ? styles.disabledText : null,
                    ]}
                  >
                    Prev
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.searchNavButton,
                    { borderColor: colors.border },
                    matchSectionIndices.length < 1 ? styles.disabledButton : null,
                  ]}
                  onPress={goToNextMatch}
                  disabled={matchSectionIndices.length < 1}
                >
                  <Text
                    style={[
                      styles.searchNavText,
                      { color: colors.primaryStrong },
                      matchSectionIndices.length < 1 ? styles.disabledText : null,
                    ]}
                  >
                    Sig
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.readerWrap}>
        <FlatList
          ref={listRef}
          data={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderSection}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={6}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          getItemLayout={(_, index) => ({
            length: estimatedSectionHeights[index] ?? 112,
            offset: estimatedSectionOffsets[index] ?? LIST_TOP_PADDING,
            index,
          })}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />

        <View
          pointerEvents="box-none"
          style={[styles.sideRailWrap, { bottom: Math.max(spacing.sm, insets.bottom + spacing.xs) }]}
        >
          <View style={styles.sideRail}>
            <View
              style={styles.scrubberTouchArea}
              {...scrubberPanResponder.panHandlers}
            >
              <View
                ref={scrubberTrackRef}
                style={[
                  styles.scrubberTrack,
                  {
                    backgroundColor: isScrubbing
                      ? isDarkMode
                        ? "rgba(27, 55, 94, 0.13)"
                        : "rgba(27, 55, 94, 0.13)"
                      : "rgba(27, 55, 94, 0.08)",
                    borderColor: isScrubbing
                      ? isDarkMode
                        ? "rgba(27, 55, 94, 0.25)"
                        : "rgba(27, 55, 94, 0.25)"
                      : "rgba(27, 55, 94, 0.16)",
                  },
                ]}
                onLayout={handleScrubberLayout}
              >
                <View style={[styles.scrubberRail, { backgroundColor: "rgba(27, 55, 94, 0.22)" }]} />
                <View
                  style={[
                    styles.scrubberThumb,
                    {
                      top: scrubberThumbTop,
                      backgroundColor: isDarkMode ? "#233B66" : "#E2EEFF",
                      borderColor: isDarkMode ? "#2D497B" : "#C7DBFF",
                    },
                  ]}
                />
                {isScrubbing && previewArticle ? (
                  <View
                    style={[
                      styles.scrubberPreviewBubble,
                      {
                        top: Math.max(0, Math.min(scrubberHeight - 48, scrubberThumbTop - 2)),
                        backgroundColor: isDarkMode ? "#233B66" : "#E2EEFF",
                        borderColor: isDarkMode ? "#2D497B" : "#C7DBFF",
                      },
                    ]}
                  >
                    <Text style={[styles.scrubberPreviewText, { color: isDarkMode ? "#F3F7FF" : colors.primaryStrong }]}>
                      Art. {previewArticle.articleNumber}
                    </Text>
                    {currentStructure?.label ? (
                      <Text
                        style={[styles.scrubberPreviewSubtitle, { color: isDarkMode ? "#C9D9F7" : colors.muted }]}
                        numberOfLines={1}
                      >
                        {currentStructure.label.replace(/\n/g, " · ")}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: readingTypography.horizontalPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: readingTypography.lawTitleSize,
    lineHeight: readingTypography.lawTitleLineHeight,
    fontWeight: "700",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.72,
  },
  structureStrip: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  structureStripHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  structureStripActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  structureToggleIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  structureNavButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  structureCaption: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  structureText: {
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 18,
  },
  structureList: {
    paddingTop: spacing.xxs,
    gap: spacing.xs,
  },
  structureChip: {
    maxWidth: 220,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    justifyContent: "center",
  },
  structureChipText: {
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 16,
  },
  searchShell: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  searchBar: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body,
    paddingVertical: 6,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchMeta: {
    flex: 1,
    fontSize: typography.small,
  },
  searchNavButtons: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  searchNavButton: {
    minWidth: 52,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  searchNavText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.38,
  },
  disabledText: {
    opacity: 0.6,
  },
  readerWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: readingTypography.horizontalPadding,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl * 2,
    paddingRight: readingTypography.horizontalPadding + 42,
  },
  sectionRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: readingTypography.sectionLabelSize,
    lineHeight: readingTypography.sectionLabelLineHeight,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: readingTypography.sectionLabelLetterSpacing,
  },
  articleHeading: {
    fontSize: readingTypography.articleLeadSize,
    lineHeight: readingTypography.articleLeadLineHeight,
    fontWeight: "800",
  },
  sectionBody: {
    letterSpacing: 0.1,
  },
  highlight: {
    borderRadius: 4,
  },
  sideRailWrap: {
    position: "absolute",
    right: 0,
    top: 0,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  sideRail: {
    width: 32,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrubberTouchArea: {
    width: 40,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrubberTrack: {
    width: 10,
    flex: 1,
    borderRadius: 999,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    overflow: "visible",
  },
  scrubberRail: {
    width: 2,
    height: "100%",
    borderRadius: 2,
  },
  scrubberThumb: {
    position: "absolute",
    left: 1,
    width: 8,
    height: SCRUBBER_THUMB_HEIGHT,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  scrubberPreviewBubble: {
    position: "absolute",
    right: 10,
    minWidth: 132,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  scrubberPreviewText: {
    fontSize: typography.small,
    fontWeight: "800",
  },
  scrubberPreviewSubtitle: {
    fontSize: typography.tiny,
    fontWeight: "600",
  },
});
