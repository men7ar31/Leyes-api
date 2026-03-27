import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
};

export const EmptyState = ({ message = "No hay resultados para mostrar." }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.muted }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: "center",
  },
  text: {
    fontSize: typography.body,
    textAlign: "center",
  },
});
