import { Pressable, StyleSheet, Text, View } from "react-native";
import { memo } from "react";
import { ChevronRight, FileText, Heart, Scale } from "lucide-react-native";
import type { SaijSearchHit } from "../types/saij";
import { radius, shadows, spacing, typography } from "../constants/theme";
import { cleanText, formatDate, maybeTruncate } from "../utils/format";
import { useAppTheme } from "../theme/appTheme";
import { resolveJurisdictionLabel } from "../utils/jurisdiction";

type Props = {
  hit: SaijSearchHit;
  onPress: () => void;
  onPressIn?: () => void;
  onFavoritePress?: () => void;
  isFavorite?: boolean;
};

const LawCardComponent = ({ hit, onPress, onPressIn, onFavoritePress, isFavorite = false }: Props) => {
  const { colors } = useAppTheme();
  const typeText = cleanText(hit.contentType || "Legislacion");
  const jurisdictionLabel = resolveJurisdictionLabel({
    jurisdiccion: hit.jurisdiccion,
    subtitle: hit.subtitle,
    title: hit.title,
    summary: hit.summary,
  });
  const summary = hit.summary ? maybeTruncate(cleanText(hit.summary), 180) : "";
  const footerParts = [formatDate(hit.fecha) || "", "SAIJ"].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        shadows.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.badgesWrap}>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <Scale size={14} color={colors.primaryStrong} strokeWidth={2} />
            <Text style={[styles.badgeText, { color: colors.primaryStrong }]} numberOfLines={1}>
              {typeText}
            </Text>
          </View>
          {jurisdictionLabel ? (
            <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: colors.iconDefault }]} numberOfLines={1}>
                {jurisdictionLabel}
              </Text>
            </View>
          ) : null}
          {hit.subtitle ? (
            <Text style={[styles.subtitleTiny, { color: colors.muted }]} numberOfLines={1}>
              {cleanText(hit.subtitle)}
            </Text>
          ) : null}
        </View>

        <View style={styles.topActions}>
          {onFavoritePress ? (
            <Pressable
              onPress={onFavoritePress}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed ? styles.iconBtnPressed : null]}
            >
              <Heart
                size={18}
                color={isFavorite ? "#D22F2F" : colors.iconDefault}
                fill={isFavorite ? "#D22F2F" : "transparent"}
                strokeWidth={2}
              />
            </Pressable>
          ) : null}
          <ChevronRight size={18} color={colors.iconDefault} strokeWidth={2} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
        {cleanText(hit.title)}
      </Text>

      {summary ? (
        <Text style={[styles.description, { color: colors.muted }]} numberOfLines={3}>
          {summary}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        <FileText size={14} color={colors.iconDefault} strokeWidth={2} />
        <Text style={[styles.footerText, { color: colors.muted }]} numberOfLines={1}>
          {footerParts}
        </Text>
      </View>
    </Pressable>
  );
};

export const LawCard = memo(LawCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  badgesWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
    maxWidth: "95%",
  },
  badgeText: {
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  subtitleTiny: {
    width: "100%",
    fontSize: typography.tiny,
    fontWeight: "500",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  iconBtnPressed: {
    opacity: 0.8,
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    lineHeight: 22,
  },
  description: {
    fontSize: typography.body,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: "500",
  },
});
