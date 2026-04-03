import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Search, SlidersHorizontal } from "lucide-react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFilterPress?: () => void;
  filterActive?: boolean;
};

export const SearchBar = ({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
  filterActive = false,
}: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Search size={18} color={colors.iconDefault} strokeWidth={2} />
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder || "Buscar leyes, articulos o palabras clave"}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
      />
      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          unstable_pressDelay={0}
          android_ripple={{ color: colors.primarySoft, borderless: true }}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: filterActive ? colors.primarySoft : colors.surface,
              borderColor: filterActive ? colors.primaryStrong : colors.border,
            },
            pressed ? styles.filterBtnPressed : null,
          ]}
          hitSlop={8}
        >
          <SlidersHorizontal size={16} color={colors.primaryStrong} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: typography.body,
    paddingVertical: 8,
  },
  filterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnPressed: {
    opacity: 0.82,
  },
});
