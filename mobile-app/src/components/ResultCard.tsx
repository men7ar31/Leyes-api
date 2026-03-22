import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SaijSearchHit } from "../types/saij";
import { colors, radius, spacing, typography } from "../constants/theme";
import { cleanText, formatDate, maybeTruncate } from "../utils/format";

type Props = {
  hit: SaijSearchHit;
  onPress: () => void;
};

export const ResultCard = ({ hit, onPress }: Props) => {
  const metaParts = [
    hit.fecha ? formatDate(hit.fecha) || hit.fecha : null,
    hit.jurisdiccion || null,
    hit.estado || null,
  ].filter(Boolean) as string[];

  const summary = hit.summary ? maybeTruncate(cleanText(hit.summary), 180) : null;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.badges}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{hit.contentType}</Text>
        </View>
        <View style={styles.badgeMuted}>
          <Text style={styles.badgeMutedText}>SAIJ</Text>
        </View>
      </View>
      <Text style={styles.title}>{cleanText(hit.title)}</Text>
      {hit.subtitle ? <Text style={styles.subtitle}>{cleanText(hit.subtitle)}</Text> : null}
      {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join("  •  ")}</Text> : null}
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: {
    color: colors.badgeText,
    fontSize: typography.small,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  badgeMuted: {
    backgroundColor: "#EEF2F7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeMutedText: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "600",
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.muted,
  },
  meta: {
    fontSize: typography.small,
    color: colors.muted,
  },
  summary: {
    fontSize: typography.body,
    color: colors.text,
  },
});