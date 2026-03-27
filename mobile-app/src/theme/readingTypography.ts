export const readingTypography = {
  lawTitleSize: 22,
  lawTitleLineHeight: 29,
  metadataSize: 13,
  metadataLineHeight: 18,
  sectionLabelSize: 13,
  sectionLabelLineHeight: 18,
  sectionLabelLetterSpacing: 0.7,
  articleLeadSize: 16,
  articleLeadLineHeight: 24,
  articleBodySize: 15.5,
  articleBodyLineHeightRatio: 1.55,
  horizontalPadding: 18,
  blockGap: 24,
  articleGap: 20,
  cardPadding: 14,
  paragraphGap: 12,
  bodyTextColor: "#1A1A1A",
  secondaryTextColor: "#6E7787",
  labelTextColor: "#3F5578",
  articleCardBackground: "#F8FAFD",
} as const;

export const getReadingBodyMetrics = (zoom: number) => {
  const fontSize = Math.round(readingTypography.articleBodySize * zoom * 10) / 10;
  const lineHeight = Math.max(22, Math.round(fontSize * readingTypography.articleBodyLineHeightRatio));
  return { fontSize, lineHeight };
};

