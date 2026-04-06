import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
  onCancel?: () => void;
  cancelLabel?: string;
};

export const LoadingState = ({ message = "Cargando...", onCancel, cancelLabel = "Volver" }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.primaryStrong} />
      <Text style={[styles.text, { color: colors.muted }]}>{message}</Text>
      {onCancel ? (
        <Pressable
          style={({ pressed }) => [
            styles.cancelButton,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed ? styles.cancelButtonPressed : null,
          ]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, { color: colors.primaryStrong }]}>{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: {
    fontSize: typography.body,
    textAlign: "center",
  },
  cancelButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonPressed: {
    opacity: 0.82,
  },
  cancelButtonText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
});
