import { StyleSheet, Text, View } from "react-native";
import { spacing } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";
import { readingTypography } from "../theme/readingTypography";

type Props = {
  label: string;
  value?: string | null;
  valueColor?: string;
  variant?: "default" | "comfortable";
};

export const MetadataRow = ({ label, value, valueColor, variant = "default" }: Props) => {
  const { colors } = useAppTheme();
  if (!value) return null;
  return (
    <View style={[styles.row, variant === "comfortable" ? styles.rowComfortable : null]}>
      <Text style={[styles.label, variant === "comfortable" ? styles.labelComfortable : null, { color: colors.muted }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          variant === "comfortable" ? styles.valueComfortable : null,
          { color: colors.text },
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
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
  rowComfortable: {
    paddingVertical: 7,
  },
  label: {
    fontSize: readingTypography.metadataSize,
    lineHeight: readingTypography.metadataLineHeight,
    letterSpacing: 0.2,
  },
  labelComfortable: {
    fontSize: readingTypography.metadataSize + 1,
    lineHeight: readingTypography.metadataLineHeight + 2,
  },
  value: {
    fontSize: readingTypography.metadataSize + 1,
    lineHeight: readingTypography.metadataLineHeight,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  valueComfortable: {
    fontSize: readingTypography.metadataSize + 2,
    lineHeight: readingTypography.metadataLineHeight + 2,
  },
});
