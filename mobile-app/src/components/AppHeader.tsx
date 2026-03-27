import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type HeaderAction = {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
};

type Props = {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
};

export const AppHeader = ({ title, subtitle, actions = [] }: Props) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.primaryStrong }]}> 
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.white }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.82)" }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.12)" },
                  pressed ? styles.actionBtnPressed : null,
                ]}
              >
                <Icon size={18} color={colors.white} strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: typography.small,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.96 }],
  },
});
