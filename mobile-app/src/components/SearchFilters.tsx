import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import type { SaijLegislationSubtype, SaijSearchRequest } from "../types/saij";
import { useAppTheme } from "../theme/appTheme";

export type JurisdictionKind = "todas" | "nacional" | "provincial" | "internacional";

export type JurisprudenceSubtype =
  | "todas"
  | "fallo"
  | "sumario"
  | "corte_suprema_nacional"
  | "nacional"
  | "federal"
  | "provincial"
  | "internacional"
  | "derecho_constitucional"
  | "derecho_civil"
  | "derecho_laboral"
  | "derecho_penal"
  | "derecho_comercial"
  | "derecho_administrativo"
  | "derecho_procesal"
  | "tribunales_etica";

export type DoctrinaSubtype =
  | "todas"
  | "doctrina_derecho_administrativo"
  | "doctrina_derecho_civil"
  | "doctrina_derecho_comercial"
  | "doctrina_derecho_constitucional"
  | "doctrina_derecho_familia"
  | "doctrina_derecho_internacional"
  | "doctrina_derecho_laboral"
  | "doctrina_derecho_penal"
  | "doctrina_derecho_procesal"
  | "doctrina_derecho_seguridad_social"
  | "doctrina_derecho_tributario_aduanero"
  | "ultima_doctrina_ingresada";

export type DictamenSubtype =
  | "todas"
  | "dictamenes_mpf"
  | "dictamenes_inadi"
  | "dictamenes_ptn"
  | "resoluciones_aaip";

type Props = {
  contentType: SaijSearchRequest["contentType"];
  onChangeContentType: (value: SaijSearchRequest["contentType"]) => void;
  legislationSubtype: SaijLegislationSubtype;
  onChangeLegislationSubtype: (value: SaijLegislationSubtype) => void;
  jurisprudenceSubtype: JurisprudenceSubtype;
  onChangeJurisprudenceSubtype: (value: JurisprudenceSubtype) => void;
  doctrinaSubtype: DoctrinaSubtype;
  onChangeDoctrinaSubtype: (value: DoctrinaSubtype) => void;
  dictamenSubtype: DictamenSubtype;
  onChangeDictamenSubtype: (value: DictamenSubtype) => void;
  jurisdictionKind: JurisdictionKind;
  onChangeJurisdictionKind: (value: JurisdictionKind) => void;
  province: string;
  onChangeProvince: (text: string) => void;
  collapseToken: number;
  showContentType?: boolean;
  showAdvanced?: boolean;
};

const contentOptions: Array<{
  label: string;
  value: SaijSearchRequest["contentType"];
  subtype: SaijLegislationSubtype;
}> = [
  { label: "Todo", value: "todo", subtype: "todas" },
  { label: "Legislacion", value: "legislacion", subtype: "todas" },
  { label: "Leyes", value: "legislacion", subtype: "leyes_nacionales_vigentes" },
  { label: "Decretos", value: "legislacion", subtype: "decretos_nacionales_vigentes" },
  { label: "Codigos", value: "legislacion", subtype: "codigo_nacional" },
  { label: "Constituciones", value: "legislacion", subtype: "constitucion_nacional" },
  { label: "Resoluciones", value: "legislacion", subtype: "resolucion_afip" },
  { label: "Tratados", value: "legislacion", subtype: "leyes_ratificatorias_tratados" },
];

const jurisdictionOptions: Array<{ label: string; value: JurisdictionKind }> = [
  { label: "Todas", value: "todas" },
  { label: "Nacional", value: "nacional" },
  { label: "Provincial", value: "provincial" },
  { label: "Internacional", value: "internacional" },
];

export const SearchFilters = ({
  contentType,
  onChangeContentType,
  legislationSubtype,
  onChangeLegislationSubtype,
  jurisdictionKind,
  onChangeJurisdictionKind,
  province,
  onChangeProvince,
  showContentType = true,
  showAdvanced = true,
}: Props) => {
  const { colors: appColors } = useAppTheme();

  return (
    <View style={styles.container}>
      {showContentType ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.muted }]}>Tipo de contenido</Text>
          <View style={styles.chips}>
            {contentOptions.map((option) => (
              <FilterChip
                key={`${option.value}-${option.subtype}`}
                label={option.label}
                selected={contentType === option.value && legislationSubtype === option.subtype}
                onPress={() => {
                  onChangeContentType(option.value);
                  onChangeLegislationSubtype(option.subtype);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {showAdvanced ? (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, { color: appColors.muted }]}>Jurisdiccion</Text>
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
              <Text style={[styles.label, { color: appColors.muted }]}>Provincia</Text>
              <TextInput
                style={[styles.input, { backgroundColor: appColors.card, borderColor: appColors.border, color: appColors.text }]}
                placeholder="Ej: Buenos Aires"
                placeholderTextColor={appColors.muted}
                value={province}
                onChangeText={onChangeProvince}
                autoCapitalize="words"
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
};

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const FilterChip = ({ label, selected, onPress }: ChipProps) => {
  const { colors: appColors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? [styles.chipActive, { backgroundColor: appColors.primaryStrong, borderColor: appColors.primaryStrong }]
          : [styles.chipInactive, { backgroundColor: appColors.surface, borderColor: appColors.border }],
        pressed ? styles.chipPressed : null,
      ]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextActive : [styles.chipTextInactive, { color: appColors.text }]]}>
        {label}
      </Text>
    </Pressable>
  );
};

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
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.body,
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
  chipPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.84,
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
