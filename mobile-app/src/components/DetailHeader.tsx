import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";
import { cleanText } from "../utils/format";

type Props = {
  title: string;
  subtitle?: string | null;
};

export const DetailHeader = ({ title, subtitle }: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{cleanText(title)}</Text>
      {subtitle ? <Text style={styles.subtitle}>{cleanText(subtitle)}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.muted,
  },
});