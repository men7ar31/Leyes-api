import { Pressable, StyleSheet, Text } from "react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  label: string;
  abbr: string;
  active?: boolean;
  onPress: () => void;
};

export const ProvinceCard = ({ label, abbr, active = false, onPress }: Props) => {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: active ? colors.primarySoft : colors.card,
          borderColor: active ? colors.primaryStrong : colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.abbrBubble,
          {
            color: colors.white,
            backgroundColor: active ? colors.primaryStrong : colors.iconDefault,
          },
        ]}
      >
        {abbr}
      </Text>
      <Text style={[styles.label, { color: active ? colors.primaryStrong : colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 112,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.84,
  },
  abbrBubble: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 20,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    lineHeight: 40,
    fontSize: typography.small,
    fontWeight: "700",
    overflow: "hidden",
  },
  label: {
    fontSize: typography.small,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },
});
