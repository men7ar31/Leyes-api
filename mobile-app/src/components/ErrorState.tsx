import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";
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
      <AlertCircle size={30} color={colors.danger} strokeWidth={2} />
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={onRetry}
        >
          <Text style={[styles.buttonText, { color: colors.white }]}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 180,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  text: {
    fontSize: typography.body,
    textAlign: "center",
  },
  button: {
    minHeight: 38,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonText: {
    fontSize: typography.body,
    fontWeight: "600",
  },
});
