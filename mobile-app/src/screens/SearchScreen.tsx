import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SearchBar } from "../components/SearchBar";
import {
  SearchFilters,
  type DictamenSubtype,
  type DoctrinaSubtype,
  type JurisprudenceSubtype,
} from "../components/SearchFilters";
import { ResultCard } from "../components/ResultCard";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { colors, radius, spacing, typography } from "../constants/theme";
import { useSaijSearch } from "../hooks/useSaijSearch";
import { addFavoriteFromSearchHit } from "../services/favorites";
import { useAppTheme } from "../theme/appTheme";
import type {
  SaijFacetNode,
  SaijLegislationSubtype,
  SaijSearchFilters,
  SaijSearchRequest,
} from "../types/saij";

const PAGE_SIZE = 20;
const RECENT_SEARCHES_MAX = 4;
const RECENT_SEARCHES_KEY = "saij_recent_opened_v1";

type FormState = {
  textoEnNorma: string;
  numeroNorma: string;
  contentType: SaijSearchRequest["contentType"];
  legislationSubtype: SaijLegislationSubtype;
  jurisprudenceSubtype: JurisprudenceSubtype;
  doctrinaSubtype: DoctrinaSubtype;
  dictamenSubtype: DictamenSubtype;
  jurisdictionKind: "todas" | "nacional" | "provincial" | "internacional";
  province: string;
  facetFecha: string;
  facetTema: string;
  facetEstadoVigencia: string;
  facetOrganismo: string;
};

type RefineSection = "anio" | "tema" | "estado" | "organismo";

type FacetOption = {
  value: string;
  label: string;
  hits: number;
};

type RecentSearchItem = {
  key: string;
  guid: string;
  title: string;
  subtitle: string | null;
  contentType: string;
};

let recentSearchesStore: RecentSearchItem[] = [];

const getDateTimestamp = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isNaN(ts) ? Number.NaN : ts;
  }

  return Number.NaN;
};

const initialState: FormState = {
  textoEnNorma: "",
  numeroNorma: "",
  contentType: "todo",
  legislationSubtype: "todas",
  jurisprudenceSubtype: "todas",
  doctrinaSubtype: "todas",
  dictamenSubtype: "todas",
  jurisdictionKind: "todas",
  province: "",
  facetFecha: "",
  facetTema: "",
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

type AutoFacetValues = {
  facetTema?: string;
  facetOrganismo?: string;
  facetJurisdiccion?: string;
};

const isJurisprudenceContentType = (value: SaijSearchRequest["contentType"]) =>
  value === "jurisprudencia" || value === "fallo" || value === "sumario";

const getJurisprudenceAutoFacets = (subtype: JurisprudenceSubtype): AutoFacetValues => {
  switch (subtype) {
    case "corte_suprema_nacional":
      return { facetOrganismo: "Organismo/Corte Suprema de Justicia de la Nación" };
    case "nacional":
      return { facetJurisdiccion: "Jurisdicción/Nacional" };
    case "federal":
      return { facetJurisdiccion: "Jurisdicción/Federal" };
    case "provincial":
      return { facetJurisdiccion: "Jurisdicción/Local" };
    case "internacional":
      return { facetJurisdiccion: "Jurisdicción/Internacional" };
    case "derecho_constitucional":
      return { facetTema: "Tema/Derecho constitucional" };
    case "derecho_civil":
      return { facetTema: "Tema/Derecho civil" };
    case "derecho_laboral":
      return { facetTema: "Tema/Derecho laboral" };
    case "derecho_penal":
      return { facetTema: "Tema/Derecho penal" };
    case "derecho_comercial":
      return { facetTema: "Tema/Derecho comercial" };
    case "derecho_administrativo":
      return { facetTema: "Tema/Derecho administrativo" };
    case "derecho_procesal":
      return { facetTema: "Tema/Derecho procesal" };
    case "tribunales_etica":
      return { facetTema: "Tema/Tribunales de ética" };
    default:
      return {};
  }
};

const getDoctrinaAutoFacets = (subtype: DoctrinaSubtype): AutoFacetValues => {
  switch (subtype) {
    case "doctrina_derecho_administrativo":
      return { facetTema: "Tema/Derecho administrativo" };
    case "doctrina_derecho_civil":
      return { facetTema: "Tema/Derecho civil" };
    case "doctrina_derecho_comercial":
      return { facetTema: "Tema/Derecho comercial" };
    case "doctrina_derecho_constitucional":
      return { facetTema: "Tema/Derecho constitucional" };
    case "doctrina_derecho_familia":
      return { facetTema: "Tema/Derecho de familia" };
    case "doctrina_derecho_internacional":
      return { facetTema: "Tema/Derecho internacional" };
    case "doctrina_derecho_laboral":
      return { facetTema: "Tema/Derecho laboral" };
    case "doctrina_derecho_penal":
      return { facetTema: "Tema/Derecho penal" };
    case "doctrina_derecho_procesal":
      return { facetTema: "Tema/Derecho procesal" };
    case "doctrina_derecho_seguridad_social":
      return { facetTema: "Tema/Derecho de la seguridad social" };
    case "doctrina_derecho_tributario_aduanero":
      return { facetTema: "Tema/Derecho tributario y aduanero" };
    default:
      return {};
  }
};

const getDictamenAutoFacets = (subtype: DictamenSubtype): AutoFacetValues => {
  switch (subtype) {
    case "dictamenes_mpf":
      return { facetOrganismo: "Organismo/Ministerio Público Fiscal" };
    case "dictamenes_inadi":
      return { facetOrganismo: "Organismo/INADI" };
    case "dictamenes_ptn":
      return { facetOrganismo: "Organismo/Procuración del Tesoro de la Nación" };
    case "resoluciones_aaip":
      return { facetOrganismo: "Organismo/Agencia de Acceso a la Información Pública" };
    default:
      return {};
  }
};

export const SearchScreen = () => {
  const [formState, setFormState] = useState<FormState>(initialState);
  const [appliedState, setAppliedState] = useState<FormState>(initialState);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(recentSearchesStore);
  const [hasSearched, setHasSearched] = useState(false);
  const [dateOrder, setDateOrder] = useState<"desc" | "asc">("desc");
  const [collapseToken, setCollapseToken] = useState(0);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [activeRefineSection, setActiveRefineSection] = useState<RefineSection | null>(null);
  const { isDarkMode, toggleThemeMode, colors: appColors } = useAppTheme();

  useEffect(() => {
    let cancelled = false;
    const loadRecent = async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as RecentSearchItem[];
        if (!Array.isArray(parsed)) return;
        const valid = parsed
          .filter((item) => item && typeof item.guid === "string" && item.guid.trim().length > 0)
          .slice(0, RECENT_SEARCHES_MAX);
        if (cancelled) return;
        recentSearchesStore = valid;
        setRecentSearches(valid);
      } catch {
        // ignore broken local cache
      }
    };
    loadRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches)).catch(() => {
      // ignore storage write failures
    });
  }, [recentSearches]);


  const filters = useMemo<SaijSearchFilters>(() => {
    const next: SaijSearchFilters = {};
    if (appliedState.textoEnNorma.trim()) next.textoEnNorma = appliedState.textoEnNorma.trim();
    if (appliedState.numeroNorma.trim()) next.numeroNorma = appliedState.numeroNorma.trim();

    if (appliedState.contentType === "legislacion" && appliedState.legislationSubtype !== "todas") {
      next.tipoNorma = appliedState.legislationSubtype;
    }
    if (
      appliedState.contentType === "jurisprudencia" &&
      (appliedState.jurisprudenceSubtype === "fallo" || appliedState.jurisprudenceSubtype === "sumario")
    ) {
      next.tipoNorma = appliedState.jurisprudenceSubtype;
    }

    let autoFacetTema = "";
    let autoFacetOrganismo = "";
    let autoFacetJurisdiccion = "";

    if (isJurisprudenceContentType(appliedState.contentType)) {
      const auto = getJurisprudenceAutoFacets(appliedState.jurisprudenceSubtype);
      autoFacetTema = auto.facetTema ?? "";
      autoFacetOrganismo = auto.facetOrganismo ?? "";
      autoFacetJurisdiccion = auto.facetJurisdiccion ?? "";
    }

    if (appliedState.contentType === "doctrina") {
      const auto = getDoctrinaAutoFacets(appliedState.doctrinaSubtype);
      autoFacetTema = auto.facetTema ?? autoFacetTema;
    }

    if (appliedState.contentType === "dictamen") {
      const auto = getDictamenAutoFacets(appliedState.dictamenSubtype);
      autoFacetOrganismo = auto.facetOrganismo ?? autoFacetOrganismo;
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
    if (appliedState.facetTema || autoFacetTema) next.facetTema = appliedState.facetTema || autoFacetTema;
    if (appliedState.facetEstadoVigencia) next.facetEstadoVigencia = appliedState.facetEstadoVigencia;
    if (appliedState.facetOrganismo || autoFacetOrganismo) {
      next.facetOrganismo = appliedState.facetOrganismo || autoFacetOrganismo;
    }
    if (autoFacetJurisdiccion) next.facetJurisdiccion = autoFacetJurisdiccion;

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

  const showRefiners = hasSearched;

  const fechaNode = useMemo(() => findFacetNode(facets, "Fecha"), [facets]);
  const temaNode = useMemo(() => findFacetNode(facets, "Tema"), [facets]);
  const estadoNode = useMemo(() => findFacetNode(facets, "Estado de Vigencia"), [facets]);
  const organismoNode = useMemo(() => findFacetNode(facets, "Organismo"), [facets]);

  const fechaOptions = useMemo(() => mapFacetChildren(fechaNode, "Fecha", 20), [fechaNode]);
  const temaOptions = useMemo(() => mapFacetChildren(temaNode, "Tema", 20), [temaNode]);
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
      facetTema: "",
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

  const registerRecentOpenedDocument = (item: {
    guid: string;
    title: string;
    subtitle: string | null;
    contentType: string;
  }) => {
    const key = String(item.guid || "").trim();
    if (!key) return;
    const nextItem: RecentSearchItem = {
      key,
      guid: key,
      title: item.title,
      subtitle: item.subtitle,
      contentType: item.contentType,
    };
    const next = [nextItem, ...recentSearches.filter((entry) => entry.key !== key)].slice(0, RECENT_SEARCHES_MAX);
    recentSearchesStore = next;
    setRecentSearches(next);
  };

  const openRecentDocument = (item: RecentSearchItem) => {
    router.push({
      pathname: "/detail/[guid]",
      params: { guid: item.guid },
    });
  };

  const addHitToFavorites = async (item: (typeof items)[number]) => {
    try {
      const result = await addFavoriteFromSearchHit(item);
      if (result.added) {
        Alert.alert(
          "Favorito agregado",
          result.offlineReady ? "Quedo guardado para usar sin conexion." : "Quedo guardado, pero sin snapshot offline."
        );
      } else {
        Alert.alert("Ya estaba en favoritos", "Ese documento ya estaba guardado.");
      }
    } catch {
      Alert.alert("No se pudo agregar favorito", "Intenta nuevamente.");
    }
  };

  const onSearch = () => {
    const nextState = { ...formState };
    setAppliedState(nextState);
    setHasSearched(true);
    setDateOrder("desc");
    setCollapseToken((prev) => prev + 1);
    if (hasSearched) {
      refetch();
    }
  };

  const canSortByDate = useMemo(
    () => items.some((item) => Number.isFinite(getDateTimestamp(item.fecha))),
    [items]
  );

  const sortedItems = useMemo(() => {
    if (!hasSearched || items.length <= 1 || !canSortByDate) return items;

    return items
      .map((item, index) => ({
        item,
        index,
        ts: getDateTimestamp(item.fecha),
      }))
      .sort((a, b) => {
        const aHasDate = Number.isFinite(a.ts);
        const bHasDate = Number.isFinite(b.ts);
        if (aHasDate && bHasDate) {
          const diff = dateOrder === "desc" ? b.ts - a.ts : a.ts - b.ts;
          if (Math.abs(diff) > 0) return diff;
        } else if (aHasDate !== bHasDate) {
          return aHasDate ? -1 : 1;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.item);
  }, [canSortByDate, dateOrder, hasSearched, items]);

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

  const screenBackgroundColor = appColors.background;
  const headerTitleColor = appColors.text;
  const themeToggleBg = isDarkMode ? "#111827" : "#F3F4F6";
  const themeToggleBorder = appColors.border;
  const themeToggleTextColor = appColors.primaryStrong;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBackgroundColor }]}>
      <FlatList
        data={hasSearched ? sortedItems : []}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        decelerationRate="normal"
        keyExtractor={(item, index) => `${String(item.guid || "no-guid")}-${index}`}
        renderItem={({ item }) => (
          <ResultCard
            hit={item}
            onPress={() => {
              registerRecentOpenedDocument({
                guid: String(item.guid || ""),
                title: String(item.title || ""),
                subtitle: item.subtitle || null,
                contentType: String(item.contentType || ""),
              });
              router.push({
                pathname: "/detail/[guid]",
                params: { guid: item.guid },
              });
            }}
            onSwipeRight={() => {
              addHitToFavorites(item);
            }}
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={[styles.title, { color: headerTitleColor }]}>Buscar en SAIJ</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.themeToggleBtn,
                  { backgroundColor: themeToggleBg, borderColor: themeToggleBorder },
                  pressed ? styles.themeToggleBtnPressed : null,
                ]}
                onPress={toggleThemeMode}
              >
                <Text style={[styles.themeToggleText, { color: themeToggleTextColor }]}>
                  {isDarkMode ? "\u2600" : "\u263D"}
                </Text>
              </Pressable>
            </View>
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
                  jurisprudenceSubtype: contentType === "jurisprudencia" ? prev.jurisprudenceSubtype : "todas",
                  doctrinaSubtype: contentType === "doctrina" ? prev.doctrinaSubtype : "todas",
                  dictamenSubtype: contentType === "dictamen" ? prev.dictamenSubtype : "todas",
                  facetFecha: "",
                  facetTema: "",
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
                  facetTema: "",
                  facetEstadoVigencia: "",
                  facetOrganismo: "",
                }))
              }
              jurisprudenceSubtype={formState.jurisprudenceSubtype}
              onChangeJurisprudenceSubtype={(jurisprudenceSubtype) =>
                setFormState((prev) => ({
                  ...prev,
                  jurisprudenceSubtype,
                  facetFecha: "",
                  facetTema: "",
                  facetEstadoVigencia: "",
                  facetOrganismo: "",
                }))
              }
              doctrinaSubtype={formState.doctrinaSubtype}
              onChangeDoctrinaSubtype={(doctrinaSubtype) =>
                setFormState((prev) => ({
                  ...prev,
                  doctrinaSubtype,
                  facetFecha: "",
                  facetTema: "",
                  facetEstadoVigencia: "",
                  facetOrganismo: "",
                }))
              }
              dictamenSubtype={formState.dictamenSubtype}
              onChangeDictamenSubtype={(dictamenSubtype) =>
                setFormState((prev) => ({
                  ...prev,
                  dictamenSubtype,
                  facetFecha: "",
                  facetTema: "",
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

            {showRefiners ? (
              <View style={styles.refineCard}>
                <Pressable
                  style={({ pressed }) => [styles.refineToggle, pressed ? styles.refineTogglePressed : null]}
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
                    <Pressable
                      style={({ pressed }) => [styles.refineSectionButton, pressed ? styles.refineSectionButtonPressed : null]}
                      onPress={() => toggleRefineSection("anio")}
                    >
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

                    <Pressable
                      style={({ pressed }) => [styles.refineSectionButton, pressed ? styles.refineSectionButtonPressed : null]}
                      onPress={() => toggleRefineSection("tema")}
                    >
                      <Text style={styles.refineSectionText}>
                        Tema {appliedState.facetTema ? `· ${getLeafLabel(appliedState.facetTema)}` : ""}
                      </Text>
                    </Pressable>
                    {activeRefineSection === "tema" ? (
                      <FacetGroup
                        title="Temas disponibles"
                        options={temaOptions}
                        selected={appliedState.facetTema}
                        onSelect={(value) =>
                          applyRefine({
                            facetTema: appliedState.facetTema === value ? "" : value,
                          })
                        }
                      />
                    ) : null}

                    <Pressable
                      style={({ pressed }) => [styles.refineSectionButton, pressed ? styles.refineSectionButtonPressed : null]}
                      onPress={() => toggleRefineSection("estado")}
                    >
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

                    <Pressable
                      style={({ pressed }) => [styles.refineSectionButton, pressed ? styles.refineSectionButtonPressed : null]}
                      onPress={() => toggleRefineSection("organismo")}
                    >
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

                    <Pressable
                      style={({ pressed }) => [styles.clearRefineButton, pressed ? styles.clearRefineButtonPressed : null]}
                      onPress={clearRefiners}
                    >
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
                style={({ pressed }) => [
                  styles.searchButton,
                  styles.actionButton,
                  provinceRequired ? styles.searchButtonDisabled : null,
                  pressed ? styles.actionButtonPressed : null,
                ]}
                onPress={onSearch}
                disabled={provinceRequired}
              >
                <Text style={styles.searchButtonText}>Buscar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.clearButton, styles.actionButton, pressed ? styles.actionButtonPressed : null]}
                onPress={clearAllFilters}
              >
                <Text style={styles.clearButtonText}>Borrar filtros</Text>
              </Pressable>
            </View>

            {!hasSearched && recentSearches.length > 0 ? (
              <View style={styles.recentsCard}>
                <Text style={styles.recentsTitle}>Ultimos documentos abiertos</Text>
                <View style={styles.recentsList}>
                  {recentSearches.map((entry) => (
                    <Pressable
                      key={entry.key}
                      style={({ pressed }) => [styles.recentItem, pressed ? styles.recentItemPressed : null]}
                      onPress={() => openRecentDocument(entry)}
                    >
                      <Text style={styles.recentItemType} numberOfLines={1}>
                        {entry.contentType}
                      </Text>
                      <Text style={styles.recentItemText} numberOfLines={2}>
                        {entry.title}
                      </Text>
                      {entry.subtitle ? (
                        <Text style={styles.recentItemSubtitle} numberOfLines={1}>
                          {entry.subtitle}
                        </Text>
                      ) : null}
                      <Text style={styles.recentItemOpen}>Abrir</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {hasSearched ? (
              <View style={styles.resultsMetaRow}>
                <Text style={styles.totalText}>{total} resultados</Text>
                {canSortByDate ? (
                  <Pressable
                    style={({ pressed }) => [styles.sortToggleButton, pressed ? styles.sortToggleButtonPressed : null]}
                    onPress={() => setDateOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                  >
                    <Text style={styles.sortToggleButtonText}>
                      A/Z · {dateOrder === "desc" ? "Mas recientes" : "Mas antiguas"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
            style={({ pressed }) => [
              styles.refineChip,
              selected === option.value ? styles.refineChipActive : styles.refineChipInactive,
              pressed ? styles.refineChipPressed : null,
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
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
  refineTogglePressed: {
    opacity: 0.75,
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
  refineSectionButtonPressed: {
    backgroundColor: "#EEF3FF",
    borderColor: "#C7D2FE",
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
  refineChipPressed: {
    opacity: 0.75,
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
  clearRefineButtonPressed: {
    backgroundColor: "#EEF3FF",
    borderColor: "#C7D2FE",
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
  themeToggleBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  themeToggleBtnPressed: {
    opacity: 0.75,
  },
  themeToggleText: {
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 20,
  },
  filterActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonPressed: {
    opacity: 0.8,
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
  resultsMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sortToggleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sortToggleButtonPressed: {
    backgroundColor: "#EEF3FF",
    borderColor: "#C7D2FE",
  },
  sortToggleButtonText: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
  },
  recentsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recentsTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  recentsList: {
    gap: spacing.xs,
  },
  recentItem: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  recentItemPressed: {
    backgroundColor: "#EEF3FF",
    borderColor: "#C7D2FE",
  },
  recentItemType: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  recentItemText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "600",
  },
  recentItemSubtitle: {
    color: colors.muted,
    fontSize: typography.small,
  },
  recentItemOpen: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "700",
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

