import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";

type Props = {
  message?: string;
  onRetry?: () => void;
};

export const ErrorState = ({ message = "Ocurrio un error.", onRetry }: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.button} onPress={onRetry}>
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
    color: colors.danger,
    fontSize: typography.body,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primaryStrong,
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