import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Option<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  options: Array<Option<T>>;
  value: T;
  onChange: (next: T) => void;
};

export const SegmentedTabs = <T extends string>({ options, value, onChange }: Props<T>) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: selected ? colors.card : "transparent",
                borderColor: selected ? colors.border : "transparent",
              },
              pressed ? styles.itemPressed : null,
            ]}
          >
            <Text
              style={[
                styles.itemText,
                { color: selected ? colors.primaryStrong : colors.muted },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  item: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  itemPressed: {
    opacity: 0.82,
  },
  itemText: {
    fontSize: typography.small,
    fontWeight: "600",
  },
});
