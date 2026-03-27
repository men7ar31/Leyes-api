import { StyleSheet, Text, View } from "react-native";
import { spacing } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";
import { readingTypography } from "../theme/readingTypography";

type Props = {
  label: string;
  value?: string | null;
  valueColor?: string;
};

export const MetadataRow = ({ label, value, valueColor }: Props) => {
  const { colors } = useAppTheme();
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }, valueColor ? { color: valueColor } : null]}>{value}</Text>
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
    fontSize: readingTypography.metadataSize,
    lineHeight: readingTypography.metadataLineHeight,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: readingTypography.metadataSize + 1,
    lineHeight: readingTypography.metadataLineHeight,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
});
