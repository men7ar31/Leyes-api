import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import { getContentUnavailableMessage } from "../utils/content";

type Props = {
  message?: string;
  reason?: string | null;
};

export const ContentUnavailableCard = ({ message, reason }: Props) => {
  const resolvedMessage = message || getContentUnavailableMessage(reason);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Contenido no disponible</Text>
      <Text style={styles.message}>{resolvedMessage}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  message: {
    color: colors.muted,
    fontSize: typography.body,
  },
});
