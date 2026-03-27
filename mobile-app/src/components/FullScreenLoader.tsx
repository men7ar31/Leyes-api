import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
};

export const FullScreenLoader = ({ message = "Cargando..." }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <ActivityIndicator size="large" color={colors.primaryStrong} />
      <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  message: {
    fontSize: typography.body,
    textAlign: "center",
  },
});
