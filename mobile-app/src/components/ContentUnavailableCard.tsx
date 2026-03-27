import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography } from "../constants/theme";
import { getContentUnavailableMessage } from "../utils/content";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
  reason?: string | null;
};

export const ContentUnavailableCard = ({ message, reason }: Props) => {
  const { colors, isDarkMode } = useAppTheme();
  const resolvedMessage = message || getContentUnavailableMessage(reason);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDarkMode ? "#2B1806" : "#FFF7ED",
          borderColor: isDarkMode ? "#7C3E09" : "#FED7AA",
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Contenido no disponible</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{resolvedMessage}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  message: {
    fontSize: typography.body,
  },
});
