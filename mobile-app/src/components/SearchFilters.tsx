import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import type { SaijLegislationSubtype, SaijSearchRequest } from "../types/saij";

type JurisdictionKind = "todas" | "nacional" | "provincial" | "internacional";

type Props = {
  numeroNorma: string;
  onChangeNumeroNorma: (text: string) => void;
  contentType: SaijSearchRequest["contentType"];
  onChangeContentType: (value: SaijSearchRequest["contentType"]) => void;
  legislationSubtype: SaijLegislationSubtype;
  onChangeLegislationSubtype: (value: SaijLegislationSubtype) => void;
  jurisdictionKind: JurisdictionKind;
  onChangeJurisdictionKind: (value: JurisdictionKind) => void;
  province: string;
  onChangeProvince: (text: string) => void;
  collapseToken: number;
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

const legislationSubtypeGroups: Array<{
  title: string;
  options: Array<{ label: string; value: SaijLegislationSubtype }>;
}> = [
  {
    title: "Leyes y tratados",
    options: [
      { label: "Normas internacionales", value: "normas_internacionales" },
      { label: "Normativa comunitaria", value: "normativa_comunitaria" },
      { label: "Leyes ratif. tratados", value: "leyes_ratificatorias_tratados" },
      { label: "Leyes nacionales vigentes", value: "leyes_nacionales_vigentes" },
      { label: "Leyes provinciales vigentes", value: "leyes_provinciales_vigentes" },
      { label: "Nuevas leyes", value: "nuevas_leyes_sancionadas" },
      { label: "Leyes vetadas", value: "leyes_vetadas" },
    ],
  },
  {
    title: "Codigos y constituciones",
    options: [
      { label: "Codigos nacionales", value: "codigo_nacional" },
      { label: "Codigos provinciales", value: "codigo_provincial" },
      { label: "Constitucion nacional", value: "constitucion_nacional" },
      { label: "Constituciones provinciales", value: "constitucion_provincial" },
    ],
  },
  {
    title: "Decretos y resoluciones",
    options: [
      { label: "Decretos nacionales vigentes", value: "decretos_nacionales_vigentes" },
      { label: "DNU", value: "dnu" },
      { label: "Resoluciones AFIP", value: "resolucion_afip" },
      { label: "Resoluciones IGJ", value: "resolucion_igj" },
      { label: "Resoluciones AABE", value: "resolucion_aabe" },
    ],
  },
];

export const SearchFilters = ({
  numeroNorma,
  onChangeNumeroNorma,
  contentType,
  onChangeContentType,
  legislationSubtype,
  onChangeLegislationSubtype,
  jurisdictionKind,
  onChangeJurisdictionKind,
  province,
  onChangeProvince,
  collapseToken,
}: Props) => {
  const [isLegislationPanelOpen, setIsLegislationPanelOpen] = useState(true);
  const [openLegislationGroup, setOpenLegislationGroup] = useState<string | null>("Leyes y tratados");

  useEffect(() => {
    if (contentType === "legislacion") {
      setIsLegislationPanelOpen(false);
      setOpenLegislationGroup(null);
    }
  }, [collapseToken, contentType]);

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>Numero de norma (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 70/2023"
          placeholderTextColor={colors.muted}
          value={numeroNorma}
          onChangeText={onChangeNumeroNorma}
          keyboardType="default"
          autoCapitalize="none"
          autoCorrect={false}
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

      {contentType === "legislacion" ? (
        <View style={styles.field}>
          <Pressable
            style={styles.mainAccordionHeader}
            onPress={() => setIsLegislationPanelOpen((prev) => !prev)}
          >
            <Text style={styles.mainAccordionTitle}>Subfiltro de legislación</Text>
            <Text style={styles.accordionHint}>{isLegislationPanelOpen ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>

          {isLegislationPanelOpen ? (
            <View style={styles.groupBlock}>
              <View style={styles.chips}>
                <FilterChip
                  label="Todas"
                  selected={legislationSubtype === "todas"}
                  onPress={() => onChangeLegislationSubtype("todas")}
                />
              </View>

              {legislationSubtypeGroups.map((group) => (
                <View key={group.title} style={styles.subGroup}>
                  <Pressable
                    style={styles.accordionHeader}
                    onPress={() =>
                      setOpenLegislationGroup((prev) => (prev === group.title ? null : group.title))
                    }
                  >
                    <Text style={styles.subGroupTitle}>{group.title}</Text>
                    <Text style={styles.accordionHint}>
                      {openLegislationGroup === group.title ? "Ocultar" : "Mostrar"}
                    </Text>
                  </Pressable>

                  {openLegislationGroup === group.title ? (
                    <View style={styles.chips}>
                      {group.options.map((option) => (
                        <FilterChip
                          key={option.value}
                          label={option.label}
                          selected={legislationSubtype === option.value}
                          onPress={() => onChangeLegislationSubtype(option.value)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}

            </View>
          ) : null}
        </View>
      ) : null}

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
  mainAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  mainAccordionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  groupBlock: {
    gap: spacing.sm,
  },
  subGroup: {
    gap: spacing.xs,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  subGroupTitle: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  accordionHint: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
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
