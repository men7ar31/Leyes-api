import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useRef, useState } from "react";
import type { SaijSearchHit } from "../types/saij";
import { colors, radius, spacing, typography } from "../constants/theme";
import { cleanText, formatDate, maybeTruncate } from "../utils/format";

type Props = {
  hit: SaijSearchHit;
  onPress: () => void;
  onSwipeRight?: () => void;
};

export const ResultCard = ({ hit, onPress, onSwipeRight }: Props) => {
  const didSwipeRef = useRef(false);
  const [isFavoriteActionVisible, setIsFavoriteActionVisible] = useState(false);

  const jurisdictionSource = cleanText(
    [hit.jurisdiccion || "", hit.subtitle || "", hit.title || ""].filter(Boolean).join(" ")
  );
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const provinceLabels: Array<{ name: string; label: string }> = [
    { name: "buenos aires", label: "Buenos Aires" },
    { name: "ciudad autonoma de buenos aires", label: "Caba" },
    { name: "caba", label: "Caba" },
    { name: "catamarca", label: "Catamarca" },
    { name: "chaco", label: "Chaco" },
    { name: "chubut", label: "Chubut" },
    { name: "cordoba", label: "Cordoba" },
    { name: "corrientes", label: "Corrientes" },
    { name: "entre rios", label: "Entre Rios" },
    { name: "formosa", label: "Formosa" },
    { name: "jujuy", label: "Jujuy" },
    { name: "la pampa", label: "La Pampa" },
    { name: "la rioja", label: "La Rioja" },
    { name: "mendoza", label: "Mendoza" },
    { name: "misiones", label: "Misiones" },
    { name: "neuquen", label: "Neuquen" },
    { name: "rio negro", label: "Rio Negro" },
    { name: "salta", label: "Salta" },
    { name: "san juan", label: "San Juan" },
    { name: "san luis", label: "San Luis" },
    { name: "santa cruz", label: "Santa Cruz" },
    { name: "santa fe", label: "Santa Fe" },
    { name: "santiago del estero", label: "Santiago del Estero" },
    { name: "tierra del fuego", label: "Tierra del Fuego" },
    { name: "tucuman", label: "Tucuman" },
  ];

  const jurisdictionBadge = (() => {
    if (!jurisdictionSource) return null;
    const lower = normalize(jurisdictionSource);
    if (lower.includes("nacional")) return "Nacional";
    if (lower.includes("internacional")) return "Internacional";
    if (lower.includes("federal")) return "Federal";

    const provinceMatch = provinceLabels.find((province) => lower.includes(province.name));
    if (provinceMatch) {
      return provinceMatch.label;
    }

    if (lower.includes("provincial") || lower.includes("local")) {
      return "Provincial";
    }
    return null;
  })();

  const metaParts = [
    hit.fecha ? formatDate(hit.fecha) || hit.fecha : null,
    hit.jurisdiccion || null,
    hit.estado || null,
  ].filter(Boolean) as string[];

  const summary = hit.summary ? maybeTruncate(cleanText(hit.summary), 180) : null;

  const swipeResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (!onSwipeRight) return false;
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      return absDx > 24 && absDx > absDy * 1.6;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!onSwipeRight) return;
      if (gestureState.dx >= 56) {
        didSwipeRef.current = true;
        setIsFavoriteActionVisible(true);
        setTimeout(() => {
          didSwipeRef.current = false;
        }, 150);
      } else if (gestureState.dx <= -38) {
        setIsFavoriteActionVisible(false);
      }
    },
  });

  return (
    <View style={styles.swipeContainer} {...swipeResponder.panHandlers}>
      {isFavoriteActionVisible && onSwipeRight ? (
        <Pressable
          style={styles.favoriteActionBtn}
          onPress={() => {
            onSwipeRight();
            setIsFavoriteActionVisible(false);
          }}
        >
          <Text style={styles.favoriteActionText}>★</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[styles.card, isFavoriteActionVisible ? styles.cardShifted : null]}
        onPress={() => {
          if (didSwipeRef.current) return;
          if (isFavoriteActionVisible) {
            setIsFavoriteActionVisible(false);
            return;
          }
          onPress();
        }}
      >
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{hit.contentType}</Text>
          </View>
          {jurisdictionBadge ? (
            <View style={styles.badgeJurisdiction}>
              <Text style={styles.badgeJurisdictionText}>{jurisdictionBadge}</Text>
            </View>
          ) : null}
          <View style={styles.badgeMuted}>
            <Text style={styles.badgeMutedText}>SAIJ</Text>
          </View>
        </View>
        <Text style={styles.title}>{cleanText(hit.title)}</Text>
        {hit.subtitle ? <Text style={styles.subtitle}>{cleanText(hit.subtitle)}</Text> : null}
        {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join("  •  ")}</Text> : null}
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  swipeContainer: {
    position: "relative",
  },
  favoriteActionBtn: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#BBD2FF",
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteActionText: {
    color: colors.primaryStrong,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardShifted: {
    marginLeft: 54,
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
  badgeJurisdiction: {
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#BBD2FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeJurisdictionText: {
    color: "#1B4DB8",
    fontSize: typography.small,
    fontWeight: "600",
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
