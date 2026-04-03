import type { SaijArticle, SaijDocument } from "../types/saij";

export type CivilCodeSimpleSection = {
  key: string;
  kind: "lead" | "article" | "paragraph";
  label: string;
  text: string;
  headingText: string;
  bodyText: string;
  articleNumber?: string | null;
  articleTitleText?: string | null;
  structureLabel?: string | null;
  structureKey?: string | null;
  searchText: string;
};

export type CivilCodeStructureItem = {
  key: string;
  label: string;
  sectionIndex: number;
  articlePointer: number;
};

export type CivilCodeArticleNavigationItem = {
  key: string;
  articleNumber: string;
  sectionIndex: number;
  articlePointer: number;
  ratio: number;
  structureLabel?: string | null;
};

export type CivilCodeReaderModel = {
  source: "contentText" | "articles" | "contentText+articles" | "fallback";
  sections: CivilCodeSimpleSection[];
  structureItems: CivilCodeStructureItem[];
  continuousText: string;
};

const readerModelCache = new Map<string, CivilCodeReaderModel>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const CIVIL_CODE_PATTERNS = [
  "codigo civil y comercial",
  "codigo civil y comercial de la nacion",
  "ccyc",
];

const CONTENT_TEXT_MIN_LENGTH = 2200;
const ARTICLE_INLINE_TITLE_MAX_LENGTH = 120;

const normalizeLoose = (value?: unknown) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const collapseText = (value?: string | null) => String(value || "").replace(/\s+/g, " ").trim();

const matchesCivilCodeText = (value?: unknown) => {
  const normalized = normalizeLoose(value);
  if (!normalized) return false;
  return CIVIL_CODE_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractDocumentMetadataStrings = (metadata: unknown, limit = 100) => {
  const values: string[] = [];
  const queue: unknown[] = [metadata];
  const visited = new Set<unknown>();

  while (queue.length > 0 && values.length < limit) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (values.length >= limit) break;
      if (
        typeof entry === "string" &&
        /(title|titulo|nombre|name|short|corto|subtype|tipo|sigla|source|fuente|descripcion)/i.test(key)
      ) {
        values.push(entry);
        continue;
      }
      if (entry && typeof entry === "object") queue.push(entry);
    }
  }

  return values;
};

export const isCivilAndCommercialCodeDocument = (document?: SaijDocument | null) => {
  if (!document) return false;

  const candidates = [
    document.title,
    document.subtitle,
    document.documentSubtype,
    document.sourceUrl,
    document.friendlyUrl,
    ...(extractDocumentMetadataStrings(document.metadata) || []),
  ];

  return candidates.some((value) => matchesCivilCodeText(value));
};

export const cleanCivilCodeReaderText = (value?: string | null) => {
  if (!value || typeof value !== "string") return "";

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\[\[\/?p\]\]|\[\/?p\]/gi, "\n\n")
    .replace(/\[\[\/?br\]\]|\[\/?br\]/gi, "\n")
    .replace(/\[\[[^\]]+\]\]|\[[^\]]+\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const getCivilCodeArticleRatio = (articlePointer: number, totalArticles: number) => {
  if (totalArticles <= 1) return 0;
  return clamp(articlePointer / (totalArticles - 1), 0, 1);
};

export const getCivilCodeArticlePointerFromRatio = (ratio: number, totalArticles: number) => {
  if (totalArticles <= 1) return 0;
  return clamp(Math.round(clamp(ratio, 0, 1) * (totalArticles - 1)), 0, totalArticles - 1);
};

export const buildCivilCodeArticleNavigationMap = (sections: CivilCodeSimpleSection[]): CivilCodeArticleNavigationItem[] => {
  const articleSections = sections.reduce<
    Array<{
      key: string;
      articleNumber: string;
      sectionIndex: number;
      structureLabel: string | null;
    }>
  >((items, section, sectionIndex) => {
    if (!section.articleNumber) return items;

    items.push({
      key: `${section.key}-nav`,
      articleNumber: section.articleNumber,
      sectionIndex,
      structureLabel: section.structureLabel || null,
    });
    return items;
  }, []);

  return articleSections.map((item, articlePointer) => ({
    ...item,
    articlePointer,
    ratio: getCivilCodeArticleRatio(articlePointer, articleSections.length),
  }));
};

const normalizeHeadingToken = (value?: string | null) => normalizeLoose(value);

const isSectionHeadingLine = (value?: string | null) =>
  /^(anexo|titulo|capitulo|seccion|libro|parte)\b/i.test(normalizeHeadingToken(value));

const isParagraphHeadingLine = (value?: string | null) => /^paragrafo\b/i.test(normalizeHeadingToken(value));
const isTitleHeadingLine = (value?: string | null) => /^titulo\b/i.test(normalizeHeadingToken(value));
const isChapterHeadingLine = (value?: string | null) => /^capitulo\b/i.test(normalizeHeadingToken(value));

const headingLevel = (value?: string | null) => {
  const token = normalizeHeadingToken(value);
  if (token.startsWith("anexo")) return 1;
  if (token.startsWith("libro")) return 2;
  if (token.startsWith("parte")) return 3;
  if (token.startsWith("titulo")) return 4;
  if (token.startsWith("capitulo")) return 5;
  if (token.startsWith("seccion")) return 6;
  return 99;
};

const applyHeadingContext = (current: string[], incoming: string[]) => {
  let next = [...current];

  incoming.forEach((heading) => {
    const cleanHeading = collapseText(cleanCivilCodeReaderText(heading));
    if (!cleanHeading) return;

    const level = headingLevel(cleanHeading);
    const existingIndex = next.findIndex((item) => headingLevel(item) === level);
    if (existingIndex >= 0) {
      next = [...next.slice(0, existingIndex), cleanHeading];
      return;
    }

    const insertBeforeIndex = next.findIndex((item) => headingLevel(item) > level);
    if (insertBeforeIndex >= 0) {
      next = [...next.slice(0, insertBeforeIndex), cleanHeading];
      return;
    }

    next = [...next, cleanHeading];
  });

  return next;
};

const buildStickySectionLabel = (headings: string[]) => {
  if (!Array.isArray(headings) || headings.length === 0) return null;

  const title = headings.filter((line) => isTitleHeadingLine(line)).at(-1) || null;
  const chapter = headings.filter((line) => isChapterHeadingLine(line)).at(-1) || null;

  if (title && chapter) return `${collapseText(title)}\n${collapseText(chapter)}`;
  if (title) return collapseText(title);
  if (chapter) return collapseText(chapter);
  return collapseText(headings[headings.length - 1] || "") || null;
};

const parseArticleTitleContext = (title?: string | null) => {
  if (!title || typeof title !== "string") {
    return { headings: [] as string[], articleLabel: null as string | null };
  }

  const canonicalTitle = collapseText(cleanCivilCodeReaderText(title))
    .replace(/\u00b7/g, "·")
    .replace(/\u2022/g, "·");

  const parts = canonicalTitle
    .split(/\s*(?:·|\|)\s*/g)
    .map((part) => collapseText(part))
    .filter(Boolean);

  if (!parts.length) {
    return { headings: [] as string[], articleLabel: null as string | null };
  }

  const headings = parts.filter((part) => isSectionHeadingLine(part) && !isParagraphHeadingLine(part));
  const articleParts = parts.filter((part) => !isSectionHeadingLine(part) && !isParagraphHeadingLine(part));
  const articleLabel = articleParts.length > 0 ? articleParts[articleParts.length - 1] : null;

  return { headings, articleLabel };
};

const getSafeArticleInlineLabel = (label?: string | null) => {
  const clean = collapseText(cleanCivilCodeReaderText(label));
  if (!clean) return null;

  const normalized = normalizeHeadingToken(clean);
  const normalizedCompact = normalized.replace(/\s+/g, "");

  if (/(anexo|titulo|capitulo|seccion|libro|parte|paragrafo)/i.test(normalizedCompact)) return null;
  if (/(codigo)/i.test(normalizedCompact) && /(nacion|argentina|civil|comercial|penal|justicia)/i.test(normalizedCompact)) {
    return null;
  }

  const lettersOnly = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "");

  if (lettersOnly.length >= 20 && lettersOnly === lettersOnly.toUpperCase()) return null;

  return clean;
};

const normalizeDetachedInlineLabelCandidate = (value?: string | null) => {
  const clean = collapseText(cleanCivilCodeReaderText(value)).replace(/^[-.:;]+\s*/, "").trim();
  if (!clean) return null;

  const firstSentence = clean.split(/[.:;]/)[0]?.trim() || "";
  const base = firstSentence.length >= 3 && firstSentence.length <= 96 ? firstSentence : clean;
  const chosen = base.replace(/[.,:;\-]+$/g, "").trim();

  if (!chosen || chosen.length < 3 || chosen.length > 120) return null;
  if (/^(?:art(?:iculo)?\.?\s*\d+)/i.test(chosen)) return null;

  return chosen;
};

const extractOpeningArticleSentence = (text?: string | null) => {
  const source = String(text || "").replace(/\r\n/g, "\n").trimStart();
  if (!source) return null;

  const cleanedStart = source
    .replace(/^[\u00ba\u00b0.\-:;,\s]+/, "")
    .replace(/^[*"'`]+/, "")
    .trimStart();

  const match = cleanedStart.match(/^([^\n.]{3,160})\.\s+([\s\S]+)$/);
  if (!match?.[1]) return null;

  return normalizeDetachedInlineLabelCandidate(match[1]);
};

const extractDetachedInlineArticleLabel = (text?: string | null) => {
  const source = String(text || "").replace(/\r\n/g, "\n").trimStart();
  if (!source) return null;

  const firstLine = source.split("\n")[0]?.trim() || "";
  if (!firstLine) return null;

  const match = firstLine.match(/^[*"'`\s]*(?:[\u00ba\u00b0\u2022\u00b7\u25e6o0])?\s*[-.:;]{1,4}\s*(.+)$/i);
  if (!match?.[1]) return null;

  return normalizeDetachedInlineLabelCandidate(match[1]);
};

const extractLeadingSentenceArticleLabel = (text?: string | null) => {
  const source = String(text || "").replace(/\r\n/g, "\n").trimStart();
  if (!source) return null;

  const match = source.match(/^([^\n.]{3,120})\.\s+([\s\S]+)$/);
  if (!match?.[1] || !match?.[2]) return null;

  const candidate = normalizeDetachedInlineLabelCandidate(match[1]);
  if (!candidate) return null;

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 10) return null;
  if (/[,:;!?]/.test(candidate)) return null;
  if (/\d/.test(candidate)) return null;

  return candidate;
};

const removeLeadingSentenceArticleLabel = (text: string, label?: string | null) => {
  const working = String(text || "").replace(/\r\n/g, "\n").trimStart();
  const normalizedLabel = normalizeDetachedInlineLabelCandidate(label) || collapseText(label);
  if (!working || !normalizedLabel) return working.trim();

  const escaped = escapeRegExp(normalizedLabel).replace(/\s+/g, "\\s+");
  return working.replace(new RegExp(`^[\\u00ba\\u00b0.\\-\\s]*${escaped}\\.\\s+`, "i"), "").trimStart();
};

const removeDetachedInlineArticleLabel = (text: string, label?: string | null) => {
  const working = String(text || "").replace(/\r\n/g, "\n").trimStart();
  const normalizedLabel = normalizeDetachedInlineLabelCandidate(label) || collapseText(label);
  if (!working || !normalizedLabel) return working.trim();

  const escaped = escapeRegExp(normalizedLabel).replace(/\s+/g, "\\s+");
  const detachedPattern = new RegExp(
    `^[*"'\`\\s]*(?:[\\u00ba\\u00b0\\u2022\\u00b7\\u25e6o0])?\\s*[-.:;]{1,4}\\s*${escaped}\\s*(?:\\n+|$|[.:;\\-\\u2013\\u2014]+\\s*)`,
    "i"
  );

  let next = working.replace(detachedPattern, "").trimStart();

  const repeatedLabelPattern = new RegExp(`^[*"'\`\\s]*${escaped}\\s*(?:[.:;\\-\\u2013\\u2014]+\\s*)`, "i");
  const deduped = next.replace(repeatedLabelPattern, "").trimStart();
  if (deduped.length < next.length) next = deduped;

  return next.trim();
};

const resolveArticleInlineLabelAndBody = (text: string, articleLabel?: string | null) => {
  const bodyBase = String(text || "").trim();
  const inlineFromTitle = getSafeArticleInlineLabel(articleLabel);
  const openingSentence = getSafeArticleInlineLabel(extractOpeningArticleSentence(bodyBase));
  const detached = getSafeArticleInlineLabel(extractDetachedInlineArticleLabel(bodyBase));
  const inferredLeading = getSafeArticleInlineLabel(extractLeadingSentenceArticleLabel(bodyBase));
  const inferred = inferredLeading;
  const inlineLabel = inlineFromTitle || openingSentence || detached || inferred || null;

  if (!inlineLabel) {
    return { inlineLabel: null as string | null, body: bodyBase };
  }

  const labelsToClean = Array.from(
    new Set([inlineLabel, openingSentence, detached, inferred].filter(Boolean) as string[])
  );
  let body = bodyBase;
  labelsToClean.forEach((candidate) => {
    body = removeDetachedInlineArticleLabel(body, candidate);
  });
  if (!inlineFromTitle) {
    if (openingSentence) body = removeLeadingSentenceArticleLabel(body, openingSentence);
    if (!detached && inferredLeading) body = removeLeadingSentenceArticleLabel(body, inferredLeading);
  }

  return { inlineLabel, body };
};

const stripRepeatedArticleLead = (body: string, articleNumber: string, inlineLabel?: string | null) => {
  let next = cleanCivilCodeReaderText(body);
  if (!next) return "";

  const escapedArticleNumber = escapeRegExp(articleNumber).replace(/\s+/g, "\\s*");
  const articleLeadPattern = new RegExp(
    `^(?:art(?:[ií]culo)?\\.?\\s*${escapedArticleNumber}\\s*(?:[-.:;\\u2013\\u2014]+\\s*)?)`,
    "i"
  );
  next = next.replace(articleLeadPattern, "").trimStart();

  const safeInlineLabel = getSafeArticleInlineLabel(inlineLabel);
  if (safeInlineLabel) {
    const escapedInlineLabel = escapeRegExp(safeInlineLabel).replace(/\s+/g, "\\s+");
    const inlineLeadPattern = new RegExp(
      `^[\\u00ba\\u00b0.\\-\\s]*${escapedInlineLabel}\\s*(?:[.:;\\-\\u2013\\u2014]+\\s*)?`,
      "i"
    );
    next = next.replace(inlineLeadPattern, "").trimStart();
  }

  next = next.replace(/^[\u00ba\u00b0.\-\s]+/, "").trimStart();

  return next.trim();
};

const buildArticleLabel = (articleNumber?: string | null, fallbackIndex?: number) =>
  articleNumber ? `Articulo ${articleNumber}` : `Articulo ${fallbackIndex || 1}`;

const normalizeArticleNumber = (value?: string | null, fallbackIndex?: number) => {
  const raw = collapseText(String(value || "").replace(/[º°]/g, ""));
  if (!raw) return fallbackIndex ? String(fallbackIndex) : "";

  const cleaned = raw
    .replace(/^(?:art(?:iculo)?\.?\s*)/i, "")
    .replace(/[.:;,]+$/g, "")
    .trim();

  const prefixedDigits = cleaned.match(/^[a-z]+\s*0*(\d+)(?:\s*([a-z]+))?$/i);
  if (prefixedDigits?.[1]) {
    const base = String(Number(prefixedDigits[1]));
    return prefixedDigits[2] ? `${base} ${prefixedDigits[2].toLowerCase()}` : base;
  }

  const plainDigits = cleaned.match(/^0*(\d+)(?:\s*([a-z]+))?$/i);
  if (plainDigits?.[1]) {
    const base = String(Number(plainDigits[1]));
    return plainDigits[2] ? `${base} ${plainDigits[2].toLowerCase()}` : base;
  }

  return cleaned || (fallbackIndex ? String(fallbackIndex) : "");
};

const buildArticleSection = (params: {
  key: string;
  articleNumber: string;
  fallbackIndex: number;
  title?: string | null;
  body?: string | null;
  headings?: string[];
}) => {
  const label = buildArticleLabel(params.articleNumber, params.fallbackIndex);
  const resolved = resolveArticleInlineLabelAndBody(cleanCivilCodeReaderText(params.body), params.title);
  const articleTitleText = resolved.inlineLabel ? resolved.inlineLabel.trim() : null;
  const headingText = articleTitleText ? `${label}. ${articleTitleText}` : label;
  let bodyText = stripRepeatedArticleLead(resolved.body, params.articleNumber, resolved.inlineLabel);
  const escapedHeading = escapeRegExp(headingText).replace(/\s+/g, "\\s+");
  bodyText = bodyText.replace(new RegExp(`^${escapedHeading}\\s*(?:\\n+|$)`, "i"), "").trimStart();
  const text = [headingText, bodyText].filter(Boolean).join("\n").trim();
  const structureLabel = buildStickySectionLabel(params.headings || []);

  return {
    key: params.key,
    kind: "article" as const,
    label,
    text,
    headingText,
    bodyText,
    articleNumber: params.articleNumber,
    articleTitleText,
    structureLabel,
    structureKey: structureLabel ? normalizeHeadingToken(structureLabel) : null,
    searchText: normalizeLoose(text),
  };
};

const buildStructureSection = (key: string, structureLabel: string, structureKey: string): CivilCodeSimpleSection => ({
  key,
  kind: "paragraph",
  label: structureLabel,
  text: structureLabel,
  headingText: structureLabel,
  bodyText: "",
  articleNumber: null,
  articleTitleText: null,
  structureLabel,
  structureKey,
  searchText: normalizeLoose(structureLabel),
});

const buildArticleSections = (articles: SaijArticle[], leadText?: string | null): CivilCodeSimpleSection[] => {
  const sections: CivilCodeSimpleSection[] = [];

  let currentHeadings: string[] = [];
  let previousStructureKey = "";

  articles.forEach((article, index) => {
    const articleNumber = normalizeArticleNumber(article.number, index + 1);
    const parsedTitle = parseArticleTitleContext(article.title);
    currentHeadings = applyHeadingContext(currentHeadings, parsedTitle.headings);

    const section = buildArticleSection({
      key: `article-${index}`,
      articleNumber: articleNumber || String(index + 1),
      fallbackIndex: index + 1,
      title: parsedTitle.articleLabel,
      body: article.text,
      headings: currentHeadings,
    });

    if (!section.text) return;
    if (section.structureLabel && section.structureKey && section.structureKey !== previousStructureKey) {
      sections.push(buildStructureSection(`structure-${section.structureKey}-${index}`, section.structureLabel, section.structureKey));
      previousStructureKey = section.structureKey;
    }
    sections.push(section);
  });

  return sections;
};

const extractHeadingLinesFromBlock = (value: string) =>
  cleanCivilCodeReaderText(value)
    .split(/\n+/)
    .map((line) => collapseText(line))
    .filter((line) => line && isSectionHeadingLine(line) && !isParagraphHeadingLine(line));

const stripHeadingLinesFromBlock = (value: string) =>
  cleanCivilCodeReaderText(value)
    .split(/\n+/)
    .map((line) => collapseText(line))
    .filter((line) => line && (!isSectionHeadingLine(line) || isParagraphHeadingLine(line)))
    .join("\n\n")
    .trim();

const splitContentTextIntoSections = (text: string) => {
  const cleaned = cleanCivilCodeReaderText(text);
  if (!cleaned) return [] as CivilCodeSimpleSection[];

  const articlePattern = /(?:^|\n)\s*(?:art(?:[ií]culo)?\.?)\s*(\d+(?:\s+[a-z]+)?[a-z]?)/gi;
  const matches = Array.from(cleaned.matchAll(articlePattern));

  if (!matches.length) {
    return cleaned
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => ({
        key: `paragraph-${index}`,
        kind: "paragraph" as const,
        label: index === 0 ? "Texto" : `Bloque ${index + 1}`,
        text: item,
        headingText: index === 0 ? "Texto" : `Bloque ${index + 1}`,
        bodyText: item,
        articleNumber: null,
        structureLabel: null,
        structureKey: null,
        searchText: normalizeLoose(item),
      }));
  }

  const sections: CivilCodeSimpleSection[] = [];
  let currentHeadings: string[] = [];
  let previousStructureKey = "";

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? cleaned.length;
    const previousBoundary = index > 0 ? (matches[index - 1]?.index ?? 0) : 0;
    const previousMatchLength = index > 0 ? (matches[index - 1]?.[0]?.length ?? 0) : 0;
    const preambleStart = index > 0 ? previousBoundary + previousMatchLength : 0;
    const preambleBlock = cleaned.slice(preambleStart, start).trim();

    if (index === 0) {
      const firstPreambleHeadings = extractHeadingLinesFromBlock(preambleBlock);
      currentHeadings = applyHeadingContext(currentHeadings, firstPreambleHeadings);
    } else {
      currentHeadings = applyHeadingContext(currentHeadings, extractHeadingLinesFromBlock(preambleBlock));
    }

    const block = cleaned.slice(start, end).trim();
    if (!block) return;

    const articleNumber = normalizeArticleNumber(match[1], index + 1) || String(index + 1);
    const articlePrefixPattern = new RegExp(
      `^(?:art(?:[ií]culo)?\\.?)\\s*${escapeRegExp(articleNumber)}(?:\\s*[.:;-])?\\s*`,
      "i"
    );
    const bodyWithoutPrefix = block.replace(articlePrefixPattern, "").trimStart();

    const section = buildArticleSection({
      key: `content-article-${index}`,
      articleNumber,
      fallbackIndex: index + 1,
      body: bodyWithoutPrefix,
      headings: currentHeadings,
    });

    if (!section.text) return;
    if (section.structureLabel && section.structureKey && section.structureKey !== previousStructureKey) {
      sections.push(
        buildStructureSection(`content-structure-${section.structureKey}-${index}`, section.structureLabel, section.structureKey)
      );
      previousStructureKey = section.structureKey;
    }
    sections.push(section);
  });

  return sections;
};

const buildContinuousTextFromSections = (sections: CivilCodeSimpleSection[]) =>
  sections
    .map((section) => [section.headingText, section.bodyText].filter(Boolean).join("\n").trim())
    .filter(Boolean)
    .join("\n\n");

const countArticleSections = (sections: CivilCodeSimpleSection[]) =>
  sections.reduce((count, section) => count + (section.kind === "article" ? 1 : 0), 0);

const buildStructureItems = (sections: CivilCodeSimpleSection[]) => {
  const items: CivilCodeStructureItem[] = [];
  let articlePointer = 0;
  let previousKey = "";

  sections.forEach((section, sectionIndex) => {
    if (!section.articleNumber) return;

    const structureLabel = section.structureLabel || null;
    const structureKey = section.structureKey || "";
    if (structureLabel && structureKey && structureKey !== previousKey) {
      items.push({
        key: structureKey,
        label: structureLabel,
        sectionIndex,
        articlePointer,
      });
      previousKey = structureKey;
    }

    articlePointer += 1;
  });

  return items;
};

export const buildCivilCodeReaderModel = (document: SaijDocument): CivilCodeReaderModel => {
  const cacheKey = [
    document.guid || "",
    document.fetchedAt || "",
    Array.isArray(document.articles) ? document.articles.length : 0,
    typeof document.contentText === "string" ? document.contentText.length : 0,
    typeof document.headerText === "string" ? document.headerText.length : 0,
  ].join("|");

  const cached = readerModelCache.get(cacheKey);
  if (cached) return cached;

  const cleanContentText = cleanCivilCodeReaderText(document.contentText);
  const leadText = cleanCivilCodeReaderText(document.headerText);
  const articleSections = buildArticleSections(Array.isArray(document.articles) ? document.articles : [], leadText);
  let contentSections: CivilCodeSimpleSection[] = [];

  let source: CivilCodeReaderModel["source"] = "fallback";
  let sections: CivilCodeSimpleSection[] = [];

  if (articleSections.length > 0) {
    source = cleanContentText ? "contentText+articles" : "articles";
    sections = articleSections;
  } else if (cleanContentText.length >= CONTENT_TEXT_MIN_LENGTH) {
    contentSections = splitContentTextIntoSections(cleanContentText);
    if (countArticleSections(contentSections) > 0 || contentSections.length > 0) {
      source = "contentText";
      sections = contentSections;
    }
  } else if (leadText) {
    source = "fallback";
    sections = [
      {
        key: "fallback-lead",
        kind: "lead",
        label: "Encabezado",
        text: leadText,
        headingText: "Encabezado",
        bodyText: leadText,
        articleNumber: null,
        structureLabel: null,
        structureKey: null,
        searchText: normalizeLoose(leadText),
      },
    ];
  }

  if (!sections.length) {
    const fallbackText = "No pudimos reconstruir el texto completo del Codigo Civil y Comercial en este momento.";
    sections = [
      {
        key: "fallback-empty",
        kind: "paragraph",
        label: "Sin contenido",
        text: fallbackText,
        headingText: "Sin contenido",
        bodyText: fallbackText,
        articleNumber: null,
        structureLabel: null,
        structureKey: null,
        searchText: normalizeLoose(fallbackText),
      },
    ];
  }

  const model = {
    source,
    sections,
    structureItems: buildStructureItems(sections),
    continuousText: cleanContentText || buildContinuousTextFromSections(sections),
  };

  readerModelCache.set(cacheKey, model);
  if (readerModelCache.size > 12) {
    const firstKey = readerModelCache.keys().next().value;
    if (firstKey) readerModelCache.delete(firstKey);
  }

  return model;
};

export const normalizeCivilCodeSearchText = (value?: string | null) => normalizeLoose(value);
