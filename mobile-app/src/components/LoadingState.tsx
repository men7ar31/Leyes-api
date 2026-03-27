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
});
