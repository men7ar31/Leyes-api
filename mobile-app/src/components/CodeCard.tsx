import { Pressable, StyleSheet, Text, View } from "react-native";
import { BookText, ChevronRight } from "lucide-react-native";
import { radius, shadows, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  title: string;
  subtitle?: string;
  onPress: () => void;
};

export const CodeCard = ({ title, subtitle, onPress }: Props) => {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        shadows.soft,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.leftIcon}>
        <BookText size={16} color={colors.primaryStrong} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.iconDefault} strokeWidth={2} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.9,
  },
  leftIcon: {
    width: 28,
    alignItems: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.small,
    fontWeight: "500",
  },
});
