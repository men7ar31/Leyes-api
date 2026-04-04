import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
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
};

const contentOptions: Array<{ label: string; value: SaijSearchRequest["contentType"] }> = [
  { label: "Todo", value: "todo" },
  { label: "Legislacion", value: "legislacion" },
  { label: "Jurisprudencia", value: "jurisprudencia" },
  { label: "Dictamenes", value: "dictamen" },
  { label: "Doctrina", value: "doctrina" },
];

const jurisdictionOptions: Array<{ label: string; value: JurisdictionKind }> = [
  { label: "Todas", value: "todas" },
  { label: "Nacional", value: "nacional" },
  { label: "Provincial", value: "provincial" },
  { label: "Internacional", value: "internacional" },
];

const legislationSubtypeGroups: Array<{
  key: "leyes_tratados" | "codigos_constituciones" | "decretos_resoluciones";
  title: string;
  options: Array<{ label: string; value: SaijLegislationSubtype }>;
}> = [
  {
    key: "leyes_tratados",
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
    key: "codigos_constituciones",
    title: "Codigos y constituciones",
    options: [
      { label: "Codigos nacionales", value: "codigo_nacional" },
      { label: "Codigos provinciales", value: "codigo_provincial" },
      { label: "Constitucion nacional", value: "constitucion_nacional" },
      { label: "Constituciones provinciales", value: "constitucion_provincial" },
    ],
  },
  {
    key: "decretos_resoluciones",
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

type LegislationQuickPick =
  | "todas"
  | "leyes_tratados"
  | "codigos_constituciones"
  | "decretos_resoluciones";

const jurisprudenceSubtypeGroups: Array<{
  title: string;
  options: Array<{ label: string; value: JurisprudenceSubtype }>;
}> = [
  {
    title: "Tipo",
    options: [
      { label: "Todos", value: "todas" },
      { label: "Fallos", value: "fallo" },
      { label: "Sumarios", value: "sumario" },
    ],
  },
  {
    title: "Jurisdiccion / tribunal",
    options: [
      { label: "Corte Suprema de Justicia de la Nacion", value: "corte_suprema_nacional" },
      { label: "Nacional", value: "nacional" },
      { label: "Federal", value: "federal" },
      { label: "Provincial", value: "provincial" },
      { label: "Internacional", value: "internacional" },
    ],
  },
  {
    title: "Tema",
    options: [
      { label: "Derecho Constitucional", value: "derecho_constitucional" },
      { label: "Derecho Civil", value: "derecho_civil" },
      { label: "Derecho Laboral", value: "derecho_laboral" },
      { label: "Derecho Penal", value: "derecho_penal" },
      { label: "Derecho Comercial", value: "derecho_comercial" },
      { label: "Derecho Administrativo", value: "derecho_administrativo" },
      { label: "Derecho Procesal", value: "derecho_procesal" },
    ],
  },
  {
    title: "Especiales",
    options: [{ label: "Tribunales de etica", value: "tribunales_etica" }],
  },
];

const doctrinaSubtypeGroups: Array<{
  title: string;
  options: Array<{ label: string; value: DoctrinaSubtype }>;
}> = [
  {
    title: "Derecho privado",
    options: [
      { label: "Doctrina de Derecho Civil", value: "doctrina_derecho_civil" },
      { label: "Doctrina de Derecho Comercial", value: "doctrina_derecho_comercial" },
      { label: "Doctrina de Derecho Laboral", value: "doctrina_derecho_laboral" },
      { label: "Doctrina de Derecho de Familia", value: "doctrina_derecho_familia" },
      { label: "Doctrina de Derecho Seguridad Social", value: "doctrina_derecho_seguridad_social" },
    ],
  },
  {
    title: "Derecho publico",
    options: [
      { label: "Doctrina de Derecho Penal", value: "doctrina_derecho_penal" },
      { label: "Doctrina de Derecho Constitucional", value: "doctrina_derecho_constitucional" },
      { label: "Doctrina de Derecho Administrativo", value: "doctrina_derecho_administrativo" },
      { label: "Doctrina de Derecho Procesal", value: "doctrina_derecho_procesal" },
      { label: "Doctrina de Derecho Tributario y Aduanero", value: "doctrina_derecho_tributario_aduanero" },
      { label: "Doctrina de Derecho Internacional", value: "doctrina_derecho_internacional" },
    ],
  },
];

const dictamenSubtypeOptions: Array<{ label: string; value: DictamenSubtype }> = [
  { label: "Todos", value: "todas" },
  { label: "Dictamenes MPF", value: "dictamenes_mpf" },
  { label: "Dictamenes INADI", value: "dictamenes_inadi" },
  { label: "Dictamenes de la Procuracion del Tesoro de la Nacion", value: "dictamenes_ptn" },
  { label: "Resoluciones de Reclamo de la Agencia de Acceso a la Inf. Publica", value: "resoluciones_aaip" },
];

export const SearchFilters = ({
  contentType,
  onChangeContentType,
  legislationSubtype,
  onChangeLegislationSubtype,
  jurisprudenceSubtype,
  onChangeJurisprudenceSubtype,
  doctrinaSubtype,
  onChangeDoctrinaSubtype,
  dictamenSubtype,
  onChangeDictamenSubtype,
  jurisdictionKind,
  onChangeJurisdictionKind,
  province,
  onChangeProvince,
  collapseToken,
}: Props) => {
  const { colors: appColors } = useAppTheme();
  const [isLegislationQuickPickOpen, setIsLegislationQuickPickOpen] = useState(false);
  const [activeLegislationQuickPick, setActiveLegislationQuickPick] = useState<LegislationQuickPick>("todas");
  const [openJurisprudenceGroup, setOpenJurisprudenceGroup] = useState<string | null>(null);
  const [isJurisprudenceQuickPickOpen, setIsJurisprudenceQuickPickOpen] = useState(false);
  const [isJurisprudenceExtrasOpen, setIsJurisprudenceExtrasOpen] = useState(false);
  const [openDoctrinaGroup, setOpenDoctrinaGroup] = useState<string | null>("Derecho privado");
  const previousContentTypeRef = useRef<SaijSearchRequest["contentType"]>(contentType);

  const raisedSurfaceStyle = {
    backgroundColor: appColors.card,
    borderColor: appColors.border,
  } as const;

  const insetSurfaceStyle = {
    backgroundColor: appColors.card,
    borderColor: appColors.border,
  } as const;

  const isJurisprudenceType = contentType === "jurisprudencia" || contentType === "fallo" || contentType === "sumario";

  useEffect(() => {
    setIsLegislationQuickPickOpen(false);
    setIsJurisprudenceQuickPickOpen(false);
    setOpenJurisprudenceGroup(null);
    setIsJurisprudenceExtrasOpen(false);
    setOpenDoctrinaGroup(null);
  }, [collapseToken]);

  useEffect(() => {
    const previousContentType = previousContentTypeRef.current;
    if (previousContentType !== contentType) {
      if (contentType === "legislacion") {
        setIsLegislationQuickPickOpen(true);
      } else {
        setIsLegislationQuickPickOpen(false);
      }

      if (isJurisprudenceType) {
        setOpenJurisprudenceGroup(null);
        setIsJurisprudenceQuickPickOpen(true);
        setIsJurisprudenceExtrasOpen(false);
      } else {
        setIsJurisprudenceQuickPickOpen(false);
        setIsJurisprudenceExtrasOpen(false);
      }

      if (contentType === "doctrina") {
        setOpenDoctrinaGroup(null);
      }
    }

    previousContentTypeRef.current = contentType;
  }, [contentType, isJurisprudenceType]);

  const onSelectJurisprudenceSubtype = (value: JurisprudenceSubtype) => {
    onChangeJurisprudenceSubtype(value);
    onChangeContentType("jurisprudencia");
    setIsJurisprudenceQuickPickOpen(false);
  };

  const onSelectContentType = (value: SaijSearchRequest["contentType"]) => {
    onChangeContentType(value);
    if (value === "legislacion") {
      setIsLegislationQuickPickOpen(true);
      return;
    }
    if (value === "jurisprudencia") {
      setIsJurisprudenceQuickPickOpen(true);
      return;
    }
    setIsJurisprudenceQuickPickOpen(false);
  };

  const onSelectLegislationQuickPick = (value: LegislationQuickPick) => {
    setActiveLegislationQuickPick(value);
    if (value === "todas") {
      onChangeLegislationSubtype("todas");
    }
    setIsLegislationQuickPickOpen(false);
  };

  const visibleLegislationGroup =
    activeLegislationQuickPick === "todas"
      ? null
      : legislationSubtypeGroups.find((group) => group.key === activeLegislationQuickPick) ?? null;

  return (
    <>
      <Modal
        visible={contentType === "legislacion" && isLegislationQuickPickOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLegislationQuickPickOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsLegislationQuickPickOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
            <Text style={[styles.modalTitle, { color: appColors.text }]}>Elegi el tipo de legislacion</Text>
            <Text style={[styles.modalText, { color: appColors.muted }]}>
              Selecciona si queres ver todo, leyes y tratados, codigos y constituciones, o decretos y resoluciones.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalOption,
                  {
                    borderColor: activeLegislationQuickPick === "todas" ? appColors.primaryStrong : appColors.border,
                    backgroundColor: activeLegislationQuickPick === "todas" ? appColors.primarySoft : appColors.surface,
                  },
                  pressed ? styles.chipPressed : null,
                ]}
                onPress={() => onSelectLegislationQuickPick("todas")}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    { color: activeLegislationQuickPick === "todas" ? appColors.primaryStrong : appColors.text },
                  ]}
                >
                  Todo
                </Text>
              </Pressable>
              {legislationSubtypeGroups.map((group) => (
                <Pressable
                  key={group.key}
                  style={({ pressed }) => [
                    styles.modalOption,
                    {
                      borderColor:
                        activeLegislationQuickPick === group.key ? appColors.primaryStrong : appColors.border,
                      backgroundColor:
                        activeLegislationQuickPick === group.key ? appColors.primarySoft : appColors.surface,
                    },
                    pressed ? styles.chipPressed : null,
                  ]}
                  onPress={() => onSelectLegislationQuickPick(group.key)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          activeLegislationQuickPick === group.key ? appColors.primaryStrong : appColors.text,
                      },
                    ]}
                  >
                    {group.title}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.modalClose} onPress={() => setIsLegislationQuickPickOpen(false)}>
              <Text style={[styles.modalCloseText, { color: appColors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={contentType === "jurisprudencia" && isJurisprudenceQuickPickOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsJurisprudenceQuickPickOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsJurisprudenceQuickPickOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
            <Text style={[styles.modalTitle, { color: appColors.text }]}>Elegi que buscar</Text>
            <Text style={[styles.modalText, { color: appColors.muted }]}>
              Selecciona si queres buscar en todos los resultados de jurisprudencia, solo fallos o solo sumarios.
            </Text>
            <View style={styles.modalActions}>
              {jurisprudenceSubtypeGroups[0].options.map((option) => (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    {
                      borderColor:
                        jurisprudenceSubtype === option.value ? appColors.primaryStrong : appColors.border,
                      backgroundColor:
                        jurisprudenceSubtype === option.value ? appColors.primarySoft : appColors.surface,
                    },
                    pressed ? styles.chipPressed : null,
                  ]}
                  onPress={() => onSelectJurisprudenceSubtype(option.value)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      {
                        color:
                          jurisprudenceSubtype === option.value ? appColors.primaryStrong : appColors.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.modalClose} onPress={() => setIsJurisprudenceQuickPickOpen(false)}>
              <Text style={[styles.modalCloseText, { color: appColors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.container}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: appColors.muted }]}>Tipo de contenido</Text>
          <View style={styles.chips}>
            {contentOptions.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={contentType === option.value}
                onPress={() => onSelectContentType(option.value)}
              />
            ))}
          </View>
        </View>

        {contentType === "legislacion" ? (
          <View style={styles.field}>
            {visibleLegislationGroup ? (
              <View style={styles.groupBlock}>
                <Pressable
                  style={({ pressed }) => [
                    styles.mainAccordionHeader,
                    raisedSurfaceStyle,
                    pressed ? styles.mainAccordionHeaderPressed : null,
                  ]}
                  onPress={() => setIsLegislationQuickPickOpen(true)}
                >
                  <Text style={[styles.mainAccordionTitle, { color: appColors.text }]}>
                    {visibleLegislationGroup.title}
                  </Text>
                  <View style={styles.inlineActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.inlineIconButton,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.chipPressed : null,
                      ]}
                      onPress={() => {
                        setActiveLegislationQuickPick("todas");
                        onChangeLegislationSubtype("todas");
                      }}
                      hitSlop={8}
                    >
                      <X size={14} color={appColors.primaryStrong} strokeWidth={2.3} />
                    </Pressable>
                    <Text style={[styles.accordionHint, { color: appColors.primaryStrong }]}>Cambiar</Text>
                  </View>
                </Pressable>

                <View style={styles.chips}>
                  <FilterChip
                    label="Todo"
                    selected={legislationSubtype === "todas"}
                    onPress={() => onChangeLegislationSubtype("todas")}
                  />
                  {visibleLegislationGroup.options.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      selected={legislationSubtype === option.value}
                      onPress={() => onChangeLegislationSubtype(option.value)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {isJurisprudenceType ? (
          <View style={styles.field}>
            <Pressable
              style={({ pressed }) => [
                styles.mainAccordionHeader,
                raisedSurfaceStyle,
                pressed ? styles.mainAccordionHeaderPressed : null,
              ]}
              onPress={() => setIsJurisprudenceExtrasOpen((prev) => !prev)}
            >
              <Text style={[styles.mainAccordionTitle, { color: appColors.text }]}>Otros filtros</Text>
              <Text style={[styles.accordionHint, { color: appColors.primaryStrong }]}>
                {isJurisprudenceExtrasOpen ? "Ocultar" : "Mostrar"}
              </Text>
            </Pressable>

            {isJurisprudenceExtrasOpen ? (
              <View style={styles.groupBlock}>
                {jurisprudenceSubtypeGroups.slice(1).map((group) => (
                  <View key={group.title} style={styles.subGroup}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.accordionHeader,
                        raisedSurfaceStyle,
                        pressed ? styles.accordionHeaderPressed : null,
                      ]}
                      onPress={() =>
                        setOpenJurisprudenceGroup((prev) => (prev === group.title ? null : group.title))
                      }
                    >
                      <Text style={[styles.subGroupTitle, { color: appColors.muted }]}>{group.title}</Text>
                      <Text style={[styles.accordionHint, { color: appColors.primaryStrong }]}>
                        {openJurisprudenceGroup === group.title ? "Ocultar" : "Mostrar"}
                      </Text>
                    </Pressable>

                    {openJurisprudenceGroup === group.title ? (
                      <View style={styles.chips}>
                        {group.options.map((option) => (
                          <FilterChip
                            key={option.value}
                            label={option.label}
                            selected={jurisprudenceSubtype === option.value}
                            onPress={() => onSelectJurisprudenceSubtype(option.value)}
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

        {contentType === "doctrina" ? (
          <View style={styles.field}>
          <Text style={[styles.mainAccordionTitle, { color: appColors.text }]}>Subfiltro de doctrina</Text>
          <View style={styles.chips}>
            <FilterChip
              label="Todas"
              selected={doctrinaSubtype === "todas"}
              onPress={() => onChangeDoctrinaSubtype("todas")}
            />
            <FilterChip
              label="Ultima Doctrina ingresada"
              selected={doctrinaSubtype === "ultima_doctrina_ingresada"}
              onPress={() => onChangeDoctrinaSubtype("ultima_doctrina_ingresada")}
            />
          </View>
          <View style={styles.groupBlock}>
            {doctrinaSubtypeGroups.map((group) => (
              <View key={group.title} style={styles.subGroup}>
                <Pressable
                  style={({ pressed }) => [
                    styles.accordionHeader,
                    raisedSurfaceStyle,
                    pressed ? styles.accordionHeaderPressed : null,
                  ]}
                  onPress={() => setOpenDoctrinaGroup((prev) => (prev === group.title ? null : group.title))}
                >
                  <Text style={[styles.subGroupTitle, { color: appColors.muted }]}>{group.title}</Text>
                  <Text style={[styles.accordionHint, { color: appColors.primaryStrong }]}>
                    {openDoctrinaGroup === group.title ? "Ocultar" : "Mostrar"}
                  </Text>
                </Pressable>
                {openDoctrinaGroup === group.title ? (
                  <View style={styles.chips}>
                    {group.options.map((option) => (
                      <FilterChip
                        key={option.value}
                        label={option.label}
                        selected={doctrinaSubtype === option.value}
                        onPress={() => onChangeDoctrinaSubtype(option.value)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          </View>
        ) : null}

        {contentType === "dictamen" ? (
          <View style={styles.field}>
          <Text style={[styles.mainAccordionTitle, { color: appColors.text }]}>Subfiltro de dictamenes</Text>
          <View style={styles.chips}>
            {dictamenSubtypeOptions.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={dictamenSubtype === option.value}
                onPress={() => onChangeDictamenSubtype(option.value)}
              />
            ))}
          </View>
          </View>
        ) : null}

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
              style={[styles.input, insetSurfaceStyle, { color: appColors.text }]}
              placeholder="Ej: Buenos Aires"
              placeholderTextColor={appColors.muted}
              value={province}
              onChangeText={onChangeProvince}
              autoCapitalize="words"
            />
          </View>
        ) : null}
      </View>
    </>
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
          : [
              styles.chipInactive,
              {
                backgroundColor: appColors.surface,
                borderColor: appColors.border,
              },
            ],
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
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 16, 34, 0.28)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  modalText: {
    fontSize: typography.small,
    lineHeight: 19,
  },
  modalActions: {
    gap: spacing.xs,
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  inlineIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOption: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  modalOptionText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  modalClose: {
    alignSelf: "center",
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  modalCloseText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  mainAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  mainAccordionHeaderPressed: {
    transform: [{ scale: 0.994 }],
    opacity: 0.86,
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  accordionHeaderPressed: {
    transform: [{ scale: 0.994 }],
    opacity: 0.86,
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

