import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Moon, Sun } from "lucide-react-native";
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
import { FullScreenLoader } from "../components/FullScreenLoader";
import { AppHeader } from "../components/AppHeader";
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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
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
      return (
        <EmptyState
          message="Ingresa un criterio para comenzar"
          hint="Busca por texto, numero de norma o tipo de contenido."
        />
      );
    }
    if (isLoading && items.length === 0) {
      return <FullScreenLoader message="Buscando en SAIJ..." />;
    }
    if (isError && items.length === 0) {
      return <ErrorState message={(error as Error)?.message || "Fallo la busqueda."} onRetry={refetch} />;
    }
    return <EmptyState message="No encontramos resultados." />;
  };

  const renderFooter = () => {
    if (!hasSearched) return null;
    if (isFetchingNextPage) return <LoadingState message="Cargando mas..." />;
    if (!hasNextPage) return null;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.loadMore,
          { borderColor: appColors.border, backgroundColor: appColors.card },
          pressed ? styles.pressed : null,
        ]}
        onPress={() => fetchNextPage()}
      >
        <Text style={[styles.loadMoreText, { color: appColors.primaryStrong }]}>Cargar mas</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: appColors.background }]}>
      <AppHeader
        title="Buscar en SAIJ"
        actions={[
          {
            icon: isDarkMode ? Sun : Moon,
            onPress: toggleThemeMode,
            label: isDarkMode ? "Modo claro" : "Modo oscuro",
          },
        ]}
      />

      <FlatList
        data={hasSearched ? sortedItems : []}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
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
          <View style={styles.headerContent}>
            <SearchBar
              value={formState.textoEnNorma}
              onChangeText={(textoEnNorma) => setFormState((prev) => ({ ...prev, textoEnNorma }))}
              placeholder="Buscar leyes, articulos o palabras clave"
              onFilterPress={() => setIsFiltersOpen((prev) => !prev)}
              filterActive={isFiltersOpen}
            />

            {isFiltersOpen ? (
              <View style={[styles.filtersCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
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
              </View>
            ) : null}

            {showRefiners ? (
              <View style={[styles.filtersCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
                <Pressable
                  style={({ pressed }) => [styles.refineToggle, pressed ? styles.pressed : null]}
                  onPress={() => {
                    setIsRefineOpen((prev) => !prev);
                    if (isRefineOpen) setActiveRefineSection(null);
                  }}
                >
                  <Text style={[styles.refineTitle, { color: appColors.text }]}>Refinar resultados</Text>
                  <Text style={[styles.refineHint, { color: appColors.primaryStrong }]}>
                    {isRefineOpen ? "Ocultar" : "Mostrar"}
                  </Text>
                </Pressable>

                {isRefineOpen ? (
                  <View style={styles.refineBody}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.refineButton,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => toggleRefineSection("anio")}
                    >
                      <Text style={[styles.refineButtonText, { color: appColors.text }]}>
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
                      style={({ pressed }) => [
                        styles.refineButton,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => toggleRefineSection("tema")}
                    >
                      <Text style={[styles.refineButtonText, { color: appColors.text }]}>
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
                      style={({ pressed }) => [
                        styles.refineButton,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => toggleRefineSection("estado")}
                    >
                      <Text style={[styles.refineButtonText, { color: appColors.text }]}> 
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
                      style={({ pressed }) => [
                        styles.refineButton,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => toggleRefineSection("organismo")}
                    >
                      <Text style={[styles.refineButtonText, { color: appColors.text }]}> 
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
                      style={({ pressed }) => [
                        styles.clearRefine,
                        { borderColor: appColors.border, backgroundColor: appColors.card },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={clearRefiners}
                    >
                      <Text style={[styles.clearRefineText, { color: appColors.muted }]}>Limpiar refinadores</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {provinceRequired ? (
              <Text style={[styles.warning, { color: appColors.danger }]}>Ingresa una provincia para jurisdiccion provincial.</Text>
            ) : null}

            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryAction,
                  { backgroundColor: appColors.primaryStrong, borderColor: appColors.primaryStrong },
                  provinceRequired ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
                onPress={onSearch}
                disabled={provinceRequired}
              >
                <Text style={[styles.primaryActionText, { color: appColors.white }]}>Buscar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { backgroundColor: appColors.card, borderColor: appColors.border },
                  pressed ? styles.pressed : null,
                ]}
                onPress={clearAllFilters}
              >
                <Text style={[styles.secondaryActionText, { color: appColors.text }]}>Borrar filtros</Text>
              </Pressable>
            </View>

            {!hasSearched && recentSearches.length > 0 ? (
              <View style={[styles.filtersCard, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
                <Text style={[styles.blockTitle, { color: appColors.text }]}>Ultimos documentos abiertos</Text>
                <View style={styles.recentsList}>
                  {recentSearches.map((entry) => (
                    <Pressable
                      key={entry.key}
                      style={({ pressed }) => [
                        styles.recentItem,
                        { borderColor: appColors.border, backgroundColor: appColors.surface },
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => openRecentDocument(entry)}
                    >
                      <Text style={[styles.recentType, { color: appColors.primaryStrong }]} numberOfLines={1}>
                        {entry.contentType}
                      </Text>
                      <Text style={[styles.recentTitle, { color: appColors.text }]} numberOfLines={2}>
                        {entry.title}
                      </Text>
                      {entry.subtitle ? (
                        <Text style={[styles.recentSubtitle, { color: appColors.muted }]} numberOfLines={1}>
                          {entry.subtitle}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {hasSearched ? (
              <View style={styles.resultsMetaRow}>
                <Text style={[styles.totalText, { color: appColors.muted }]}>{total} resultados</Text>
                {canSortByDate ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.sortBtn,
                      { borderColor: appColors.border, backgroundColor: appColors.card },
                      pressed ? styles.pressed : null,
                    ]}
                    onPress={() => setDateOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                  >
                    <Text style={[styles.sortBtnText, { color: appColors.primaryStrong }]}> 
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
  const { colors: appColors } = useAppTheme();
  if (!options.length) return null;

  return (
    <View style={styles.refineGroup}>
      <Text style={[styles.refineGroupTitle, { color: appColors.muted }]}>{title}</Text>
      <View style={styles.refineChips}>
        {options.map((option) => (
          <Pressable
            key={`${title}-${option.value}`}
            style={({ pressed }) => [
              styles.refineChip,
              {
                borderColor: selected === option.value ? appColors.primaryStrong : appColors.border,
                backgroundColor: selected === option.value ? appColors.primarySoft : appColors.card,
              },
              pressed ? styles.pressed : null,
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.refineChipText,
                { color: selected === option.value ? appColors.primaryStrong : appColors.text },
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
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerContent: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  filtersCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  refineToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refineTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  refineHint: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  refineBody: {
    gap: spacing.sm,
  },
  refineButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  refineButtonText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  refineGroup: {
    gap: spacing.xs,
  },
  refineGroupTitle: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  refineChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  refineChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  refineChipText: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  clearRefine: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  clearRefineText: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  warning: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  secondaryActionText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
  recentsList: {
    gap: spacing.xs,
  },
  recentItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  recentType: {
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  recentTitle: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  recentSubtitle: {
    fontSize: typography.small,
  },
  blockTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  resultsMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  totalText: {
    fontSize: typography.small,
  },
  sortBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sortBtnText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  loadMore: {
    marginTop: spacing.md,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
});
