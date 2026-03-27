import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
};

export const LoadingState = ({ message = "Cargando..." }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.primaryStrong} />
      <Text style={[styles.text, { color: colors.muted }]}>{message}</Text>
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
    fontSize: typography.body,
  },
});
