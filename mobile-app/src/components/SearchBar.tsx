import { StyleSheet, TextInput, View } from "react-native";
import { radius, spacing, typography } from "../constants/theme";
import { useAppTheme } from "../theme/appTheme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export const SearchBar = ({ value, onChangeText, placeholder }: Props) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder || "Buscar texto en norma"}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  input: {
    fontSize: typography.body,
  },
});
