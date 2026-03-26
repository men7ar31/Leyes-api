import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

type Props = {
  label: string;
  value?: string | null;
  valueColor?: string;
};

export const MetadataRow = ({ label, value, valueColor }: Props) => {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    color: colors.muted,
    fontSize: typography.small,
  },
  value: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
});
