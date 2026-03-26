import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SearchBar } from "../components/SearchBar";
import { SearchFilters } from "../components/SearchFilters";
import { ResultCard } from "../components/ResultCard";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { colors, radius, spacing, typography } from "../constants/theme";
import { useSaijSearch } from "../hooks/useSaijSearch";
import type {
  SaijFacetNode,
  SaijLegislationSubtype,
  SaijSearchFilters,
  SaijSearchRequest,
} from "../types/saij";

const PAGE_SIZE = 20;

type FormState = {
  textoEnNorma: string;
  numeroNorma: string;
  contentType: SaijSearchRequest["contentType"];
  legislationSubtype: SaijLegislationSubtype;
  jurisdictionKind: "todas" | "nacional" | "provincial" | "internacional";
  province: string;
  facetFecha: string;
  facetEstadoVigencia: string;
  facetOrganismo: string;
};

type RefineSection = "anio" | "estado" | "organismo";

type FacetOption = {
  value: string;
  label: string;
  hits: number;
};

const initialState: FormState = {
  textoEnNorma: "",
  numeroNorma: "",
  contentType: "legislacion",
  legislationSubtype: "todas",
  jurisdictionKind: "todas",
  province: "",
  facetFecha: "",
  facetEstadoVigencia: "",
  facetOrganismo: "",
};

const normalizeFacetText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const cleanFacetLabel = (value?: string | null) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const findFacetNode = (facets: SaijFacetNode[], facetName: string): SaijFacetNode | null => {
  const target = normalizeFacetText(facetName);
  return facets.find((item) => normalizeFacetText(String(item?.facetName || "")) === target) ?? null;
};

const mapFacetChildren = (node: SaijFacetNode | null, pathPrefix: string, limit = 20): FacetOption[] => {
  if (!node || !Array.isArray(node.facetChildren)) return [];

  const mapped = node.facetChildren
    .map((child) => {
      const label = cleanFacetLabel(child.facetName);
      if (!label || normalizeFacetText(label) === "categoriavacia") return null;
      return {
        value: `${pathPrefix}/${label}`,
        label,
        hits: Number(child.facetHits || 0),
      };
    })
    .filter((item): item is FacetOption => Boolean(item));

  const dedup = new Map<string, FacetOption>();
  for (const item of mapped) {
    const key = normalizeFacetText(item.value);
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return Array.from(dedup.values()).slice(0, limit);
};

const getLeafLabel = (value?: string) => {
  if (!value) return "";
  const parts = value.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

export const SearchScreen = () => {
  const [formState, setFormState] = useState<FormState>(initialState);
  const [appliedState, setAppliedState] = useState<FormState>(initialState);
  const [hasSearched, setHasSearched] = useState(false);
  const [collapseToken, setCollapseToken] = useState(0);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [activeRefineSection, setActiveRefineSection] = useState<RefineSection | null>(null);

  const filters = useMemo<SaijSearchFilters>(() => {
    const next: SaijSearchFilters = {};
    if (appliedState.textoEnNorma.trim()) next.textoEnNorma = appliedState.textoEnNorma.trim();
    if (appliedState.numeroNorma.trim()) next.numeroNorma = appliedState.numeroNorma.trim();

    if (appliedState.contentType === "legislacion" && appliedState.legislationSubtype !== "todas") {
      next.tipoNorma = appliedState.legislationSubtype;
    }

    if (appliedState.jurisdictionKind === "provincial") {
      next.jurisdiccion = {
        kind: "provincial",
        provincia: appliedState.province.trim(),
      };
    } else {
      next.jurisdiccion = { kind: appliedState.jurisdictionKind };
    }

    if (appliedState.facetFecha) next.facetFecha = appliedState.facetFecha;
    if (appliedState.facetEstadoVigencia) next.facetEstadoVigencia = appliedState.facetEstadoVigencia;
    if (appliedState.facetOrganismo) next.facetOrganismo = appliedState.facetOrganismo;

    return next;
  }, [appliedState]);

  const {
    items,
    total,
    facets,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useSaijSearch({
    contentType: appliedState.contentType,
    filters,
    pageSize: PAGE_SIZE,
    enabled: hasSearched,
  });

  const provinceRequired =
    formState.jurisdictionKind === "provincial" && formState.province.trim().length === 0;

  const showLegislationRefiners =
    hasSearched &&
    appliedState.contentType === "legislacion" &&
    appliedState.legislationSubtype !== "todas";

  const fechaNode = useMemo(() => findFacetNode(facets, "Fecha"), [facets]);
  const estadoNode = useMemo(() => findFacetNode(facets, "Estado de Vigencia"), [facets]);
  const organismoNode = useMemo(() => findFacetNode(facets, "Organismo"), [facets]);

  const fechaOptions = useMemo(() => mapFacetChildren(fechaNode, "Fecha", 20), [fechaNode]);
  const estadoOptions = useMemo(() => mapFacetChildren(estadoNode, "Estado de Vigencia", 12), [estadoNode]);
  const organismoOptions = useMemo(() => mapFacetChildren(organismoNode, "Organismo", 12), [organismoNode]);

  const applyRefine = (updates: Partial<FormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
    setAppliedState((prev) => ({ ...prev, ...updates }));
    setHasSearched(true);
  };

  const clearRefiners = () =>
    applyRefine({
      facetFecha: "",
      facetEstadoVigencia: "",
      facetOrganismo: "",
    });

  const clearAllFilters = () => {
    setFormState(initialState);
    setAppliedState(initialState);
    setHasSearched(false);
    setIsRefineOpen(false);
    setActiveRefineSection(null);
  };

  const toggleRefineSection = (section: RefineSection) => {
    setActiveRefineSection((prev) => (prev === section ? null : section));
  };

  const onSearch = () => {
    setAppliedState({ ...formState });
    setHasSearched(true);
    setCollapseToken((prev) => prev + 1);
    if (hasSearched) {
      refetch();
    }
  };

  const renderEmpty = () => {
    if (!hasSearched) {
      return <EmptyState message="Ingresa un criterio y presiona Buscar." />;
    }
    if (isLoading) {
      return <LoadingState message="Buscando en SAIJ..." />;
    }
    if (isError) {
      return <ErrorState message={(error as Error)?.message || "Fallo la busqueda."} onRetry={refetch} />;
    }
    return <EmptyState message="No encontramos resultados." />;
  };

  const renderFooter = () => {
    if (!hasSearched) return null;
    if (isFetchingNextPage) return <LoadingState message="Cargando mas..." />;
    if (!hasNextPage) return null;
    return (
      <Pressable style={styles.loadMore} onPress={() => fetchNextPage()}>
        <Text style={styles.loadMoreText}>Cargar mas</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={hasSearched ? items : []}
        keyExtractor={(item, index) => `${String(item.guid || "no-guid")}-${index}`}
        renderItem={({ item }) => (
          <ResultCard
            hit={item}
            onPress={() =>
              router.push({
                pathname: "/detail/[guid]",
                params: { guid: item.guid },
              })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Buscar en SAIJ</Text>
            <SearchBar
              value={formState.textoEnNorma}
              onChangeText={(textoEnNorma) => setFormState((prev) => ({ ...prev, textoEnNorma }))}
              placeholder="Texto en norma"
            />
            <SearchFilters
              numeroNorma={formState.numeroNorma}
              onChangeNumeroNorma={(numeroNorma) => setFormState((prev) => ({ ...prev, numeroNorma }))}
              contentType={formState.contentType}
              onChangeContentType={(contentType) =>
                setFormState((prev) => ({
                  ...prev,
                  contentType,
                  legislationSubtype: contentType === "legislacion" ? prev.legislationSubtype : "todas",
                  facetFecha: "",
                  facetEstadoVigencia: "",
                  facetOrganismo: "",
                }))
              }
              legislationSubtype={formState.legislationSubtype}
              onChangeLegislationSubtype={(legislationSubtype) =>
                setFormState((prev) => ({
                  ...prev,
                  legislationSubtype,
                  facetFecha: "",
                  facetEstadoVigencia: "",
                  facetOrganismo: "",
                }))
              }
              jurisdictionKind={formState.jurisdictionKind}
              onChangeJurisdictionKind={(jurisdictionKind) =>
                setFormState((prev) => ({ ...prev, jurisdictionKind }))
              }
              province={formState.province}
              onChangeProvince={(province) => setFormState((prev) => ({ ...prev, province }))}
              collapseToken={collapseToken}
            />

            {showLegislationRefiners ? (
              <View style={styles.refineCard}>
                <Pressable
                  style={styles.refineToggle}
                  onPress={() => {
                    setIsRefineOpen((prev) => !prev);
                    if (isRefineOpen) setActiveRefineSection(null);
                  }}
                >
                  <Text style={styles.refineTitle}>Refinar resultados</Text>
                  <Text style={styles.refineToggleHint}>{isRefineOpen ? "Ocultar" : "Mostrar"}</Text>
                </Pressable>

                {isRefineOpen ? (
                  <View style={styles.refineMenu}>
                    <Pressable style={styles.refineSectionButton} onPress={() => toggleRefineSection("anio")}>
                      <Text style={styles.refineSectionText}>
                        Años {appliedState.facetFecha ? `· ${getLeafLabel(appliedState.facetFecha)}` : ""}
                      </Text>
                    </Pressable>
                    {activeRefineSection === "anio" ? (
                      <FacetGroup
                        title="Años disponibles"
                        options={fechaOptions}
                        selected={appliedState.facetFecha}
                        onSelect={(value) =>
                          applyRefine({
                            facetFecha: appliedState.facetFecha === value ? "" : value,
                          })
                        }
                      />
                    ) : null}

                    <Pressable style={styles.refineSectionButton} onPress={() => toggleRefineSection("estado")}>
                      <Text style={styles.refineSectionText}>
                        Estado de vigencia {appliedState.facetEstadoVigencia ? `· ${getLeafLabel(appliedState.facetEstadoVigencia)}` : ""}
                      </Text>
                    </Pressable>
                    {activeRefineSection === "estado" ? (
                      <FacetGroup
                        title="Estados disponibles"
                        options={estadoOptions}
                        selected={appliedState.facetEstadoVigencia}
                        onSelect={(value) =>
                          applyRefine({
                            facetEstadoVigencia: appliedState.facetEstadoVigencia === value ? "" : value,
                          })
                        }
                      />
                    ) : null}

                    <Pressable style={styles.refineSectionButton} onPress={() => toggleRefineSection("organismo")}>
                      <Text style={styles.refineSectionText}>
                        Organismo {appliedState.facetOrganismo ? `· ${getLeafLabel(appliedState.facetOrganismo)}` : ""}
                      </Text>
                    </Pressable>
                    {activeRefineSection === "organismo" ? (
                      <FacetGroup
                        title="Organismos"
                        options={organismoOptions}
                        selected={appliedState.facetOrganismo}
                        onSelect={(value) =>
                          applyRefine({
                            facetOrganismo: appliedState.facetOrganismo === value ? "" : value,
                          })
                        }
                      />
                    ) : null}

                    <Pressable style={styles.clearRefineButton} onPress={clearRefiners}>
                      <Text style={styles.clearRefineText}>Limpiar refinadores</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {provinceRequired ? (
              <Text style={styles.warning}>Ingresa una provincia para buscar por jurisdiccion provincial.</Text>
            ) : null}

            <View style={styles.filterActions}>
              <Pressable
                style={[styles.searchButton, styles.actionButton, provinceRequired ? styles.searchButtonDisabled : null]}
                onPress={onSearch}
                disabled={provinceRequired}
              >
                <Text style={styles.searchButtonText}>Buscar</Text>
              </Pressable>

              <Pressable style={[styles.clearButton, styles.actionButton]} onPress={clearAllFilters}>
                <Text style={styles.clearButtonText}>Borrar filtros</Text>
              </Pressable>
            </View>

            {hasSearched ? <Text style={styles.totalText}>{total} resultados</Text> : null}

            {isError && items.length > 0 ? (
              <ErrorState message={(error as Error)?.message || "Fallo la busqueda."} onRetry={refetch} />
            ) : null}
          </View>
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
      />
    </SafeAreaView>
  );
};

type FacetGroupProps = {
  title: string;
  options: FacetOption[];
  selected: string;
  onSelect: (value: string) => void;
};

const FacetGroup = ({ title, options, selected, onSelect }: FacetGroupProps) => {
  if (!options.length) return null;

  return (
    <View style={styles.refineGroup}>
      <Text style={styles.refineGroupTitle}>{title}</Text>
      <View style={styles.refineChips}>
        {options.map((option) => (
          <Pressable
            key={`${title}-${option.value}`}
            style={[
              styles.refineChip,
              selected === option.value ? styles.refineChipActive : styles.refineChipInactive,
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.refineChipText,
                selected === option.value ? styles.refineChipTextActive : styles.refineChipTextInactive,
              ]}
            >
              {option.label} ({option.hits})
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  refineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  refineToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refineTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  refineToggleHint: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
  },
  refineMenu: {
    gap: spacing.sm,
  },
  refineSectionButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  refineSectionText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
  },
  refineGroup: {
    gap: spacing.xs,
  },
  refineGroupTitle: {
    color: colors.muted,
    fontSize: typography.small,
  },
  refineChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  refineChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  refineChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  refineChipInactive: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  refineChipText: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  refineChipTextActive: {
    color: "#FFFFFF",
  },
  refineChipTextInactive: {
    color: colors.text,
  },
  clearRefineButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  clearRefineText: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  searchButton: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  clearButton: {
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearButtonText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "600",
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "600",
  },
  warning: {
    color: colors.danger,
    fontSize: typography.small,
  },
  totalText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  loadMore: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  loadMoreText: {
    color: colors.primaryStrong,
    fontSize: typography.body,
    fontWeight: "600",
  },
});
