import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

type Props = {
  message?: string;
};

export const EmptyState = ({ message = "No hay resultados para mostrar." }: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: "center",
  },
  text: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: "center",
  },
});