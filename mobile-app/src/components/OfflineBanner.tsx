import { StyleSheet, Text, View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  text?: string;
};

export const OfflineBanner = ({ text = "Disponible sin conexion" }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.successSoft, borderColor: colors.border }]}> 
      <WifiOff size={16} color={colors.success} strokeWidth={2} />
      <Text style={[styles.text, { color: colors.success }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  text: {
    fontSize: typography.small,
    fontWeight: "600",
  },
});
