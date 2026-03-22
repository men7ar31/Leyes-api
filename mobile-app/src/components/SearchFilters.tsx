import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import type { SaijSearchRequest } from "../types/saij";

type JurisdictionKind = "todas" | "nacional" | "provincial" | "internacional";

type Props = {
  numeroNorma: string;
  onChangeNumeroNorma: (text: string) => void;
  contentType: SaijSearchRequest["contentType"];
  onChangeContentType: (value: SaijSearchRequest["contentType"]) => void;
  jurisdictionKind: JurisdictionKind;
  onChangeJurisdictionKind: (value: JurisdictionKind) => void;
  province: string;
  onChangeProvince: (text: string) => void;
};

const contentOptions: Array<{ label: string; value: SaijSearchRequest["contentType"] }> = [
  { label: "Legislacion", value: "legislacion" },
  { label: "Todo", value: "todo" },
  { label: "Fallo", value: "fallo" },
  { label: "Sumario", value: "sumario" },
  { label: "Dictamen", value: "dictamen" },
  { label: "Doctrina", value: "doctrina" },
];

const jurisdictionOptions: Array<{ label: string; value: JurisdictionKind }> = [
  { label: "Todas", value: "todas" },
  { label: "Nacional", value: "nacional" },
  { label: "Provincial", value: "provincial" },
  { label: "Internacional", value: "internacional" },
];

export const SearchFilters = ({
  numeroNorma,
  onChangeNumeroNorma,
  contentType,
  onChangeContentType,
  jurisdictionKind,
  onChangeJurisdictionKind,
  province,
  onChangeProvince,
}: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>Numero de norma (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 27541"
          placeholderTextColor={colors.muted}
          value={numeroNorma}
          onChangeText={onChangeNumeroNorma}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Tipo de contenido</Text>
        <View style={styles.chips}>
          {contentOptions.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={contentType === option.value}
              onPress={() => onChangeContentType(option.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Jurisdiccion</Text>
        <View style={styles.chips}>
          {jurisdictionOptions.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={jurisdictionKind === option.value}
              onPress={() => onChangeJurisdictionKind(option.value)}
            />
          ))}
        </View>
      </View>

      {jurisdictionKind === "provincial" ? (
        <View style={styles.field}>
          <Text style={styles.label}>Provincia</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Buenos Aires"
            placeholderTextColor={colors.muted}
            value={province}
            onChangeText={onChangeProvince}
            autoCapitalize="words"
          />
        </View>
      ) : null}
    </View>
  );
};

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const FilterChip = ({ label, selected, onPress }: ChipProps) => (
  <Pressable
    onPress={onPress}
    style={[styles.chip, selected ? styles.chipActive : styles.chipInactive]}
  >
    <Text style={[styles.chipText, selected ? styles.chipTextActive : styles.chipTextInactive]}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontSize: typography.small,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.body,
    color: colors.text,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  chipTextInactive: {
    color: colors.text,
  },
});
