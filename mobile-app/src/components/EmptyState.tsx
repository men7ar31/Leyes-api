import { StyleSheet, Text, View } from "react-native";
import { BookOpen, type LucideIcon } from "lucide-react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  message?: string;
  hint?: string;
  icon?: LucideIcon;
};

export const EmptyState = ({
  message = "No hay resultados para mostrar.",
  hint,
  icon: Icon = BookOpen,
}: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <Icon size={36} color={colors.primaryStrong} strokeWidth={2} />
      </View>
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    fontSize: typography.subtitle,
    textAlign: "center",
    fontWeight: "700",
  },
  hint: {
    fontSize: typography.body,
    textAlign: "center",
  },
});
