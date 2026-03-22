import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

type Props = {
  message?: string;
};

export const LoadingState = ({ message = "Cargando..." }: Props) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.primaryStrong} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    color: colors.muted,
    fontSize: typography.body,
  },
});