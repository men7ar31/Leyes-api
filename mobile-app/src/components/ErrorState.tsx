import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
  onRetry?: () => void;
};

export const ErrorState = ({ message = "Ocurrio un error.", onRetry }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
      {onRetry ? (
        <Pressable style={[styles.button, { backgroundColor: colors.primaryStrong }]} onPress={onRetry}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    fontSize: typography.body,
    textAlign: "center",
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "600",
  },
});
