import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SearchBar } from "../components/SearchBar";
import { ResultCard } from "../components/ResultCard";
import { colors, radius, spacing, typography } from "../constants/theme";
import { useSaijSearch } from "../hooks/useSaijSearch";

type CodesScope = "nacional" | "provincial";

const NATIONAL_MATTERS = [
  { key: "civil", label: "Civil y comercial", query: "civil comercial" },
  { key: "penal", label: "Penal", query: "penal" },
  { key: "laboral", label: "Laboral", query: "trabajo laboral" },
  { key: "procesal", label: "Procesal", query: "procesal" },
  { key: "administrativo", label: "Administrativo", query: "administrativo" },
  { key: "mineria", label: "Mineria", query: "mineria" },
  { key: "aeronautico", label: "Aeronautico", query: "aeronautico" },
  { key: "aduanero", label: "Aduanero", query: "aduanero" },
];

const PROVINCES = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Cordoba",
  "Corrientes",
  "Entre Rios",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquen",
  "Rio Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucuman",
  "Ciudad Autonoma de Buenos Aires",
];

export const CodesScreen = () => {
  const [scope, setScope] = useState<CodesScope>("nacional");
  const [query, setQuery] = useState("codigo");
  const [selectedMatterKey, setSelectedMatterKey] = useState<string>("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [isMatterAccordionOpen, setIsMatterAccordionOpen] = useState(false);
  const [isProvinceAccordionOpen, setIsProvinceAccordionOpen] = useState(false);

  const selectedMatter = useMemo(
    () => NATIONAL_MATTERS.find((matter) => matter.key === selectedMatterKey) || null,
    [selectedMatterKey]
  );

  const canSearch = scope === "nacional" ? Boolean(selectedMatter) : selectedProvince.trim().length > 0;
  const effectiveQuery = (query.trim() || "codigo").trim();

  const filters = useMemo(() => {
    const baseQuery =
      scope === "nacional"
        ? `codigo ${selectedMatter?.query || ""} ${effectiveQuery}`
        : `codigo ${effectiveQuery}`;

    if (scope === "nacional") {
      return {
        textoEnNorma: baseQuery.trim(),
        tipoNorma: "codigo_nacional",
        jurisdiccion: { kind: "nacional" } as const,
      };
    }

    return {
      textoEnNorma: baseQuery.trim(),
      tipoNorma: "codigo_provincial",
      jurisdiccion: { kind: "provincial", provincia: selectedProvince.trim() } as const,
    };
  }, [effectiveQuery, scope, selectedMatter, selectedProvince]);

  const { items, total, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useSaijSearch({
    contentType: "legislacion",
    filters,
    pageSize: 20,
    enabled: canSearch,
  });

  const titleHint =
    scope === "nacional"
      ? selectedMatter
        ? `Materia: ${selectedMatter.label}`
        : "Selecciona una materia para ver codigos nacionales."
      : selectedProvince
        ? `Provincia: ${selectedProvince}`
        : "Selecciona una provincia para ver codigos provinciales.";

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={canSearch ? items : []}
        keyExtractor={(item, index) => `${String(item.guid || "no-guid")}-${index}`}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Codigos</Text>
            <Text style={styles.subtitle}>Filtra por materia (nacionales) o por provincia (provinciales).</Text>

            <View style={styles.scopeRow}>
              <Pressable
                style={[styles.scopeBtn, scope === "nacional" ? styles.scopeBtnActive : null]}
                onPress={() => setScope("nacional")}
              >
                <Text style={[styles.scopeBtnText, scope === "nacional" ? styles.scopeBtnTextActive : null]}>Nacionales</Text>
              </Pressable>
              <Pressable
                style={[styles.scopeBtn, scope === "provincial" ? styles.scopeBtnActive : null]}
                onPress={() => setScope("provincial")}
              >
                <Text style={[styles.scopeBtnText, scope === "provincial" ? styles.scopeBtnTextActive : null]}>Provinciales</Text>
              </Pressable>
            </View>

            {scope === "nacional" ? (
              <View style={styles.accordionCard}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => setIsMatterAccordionOpen((prev) => !prev)}
                >
                  <Text style={styles.accordionTitle}>Materia {selectedMatter ? `· ${selectedMatter.label}` : ""}</Text>
                  <Text style={styles.accordionToggle}>{isMatterAccordionOpen ? "Ocultar" : "Mostrar"}</Text>
                </Pressable>
                {isMatterAccordionOpen ? (
                  <View style={styles.chipsWrap}>
                    {NATIONAL_MATTERS.map((matter) => (
                      <Pressable
                        key={matter.key}
                        style={[
                          styles.chip,
                          selectedMatterKey === matter.key ? styles.chipActive : styles.chipInactive,
                        ]}
                        onPress={() => {
                          setSelectedMatterKey(matter.key);
                          setIsMatterAccordionOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selectedMatterKey === matter.key ? styles.chipTextActive : styles.chipTextInactive,
                          ]}
                        >
                          {matter.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.accordionCard}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => setIsProvinceAccordionOpen((prev) => !prev)}
                >
                  <Text style={styles.accordionTitle}>Provincia {selectedProvince ? `· ${selectedProvince}` : ""}</Text>
                  <Text style={styles.accordionToggle}>{isProvinceAccordionOpen ? "Ocultar" : "Mostrar"}</Text>
                </Pressable>
                {isProvinceAccordionOpen ? (
                  <View style={styles.chipsWrap}>
                    {PROVINCES.map((province) => (
                      <Pressable
                        key={province}
                        style={[
                          styles.chip,
                          selectedProvince === province ? styles.chipActive : styles.chipInactive,
                        ]}
                        onPress={() => {
                          setSelectedProvince(province);
                          setIsProvinceAccordionOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selectedProvince === province ? styles.chipTextActive : styles.chipTextInactive,
                          ]}
                        >
                          {province}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            )}

            <SearchBar value={query} onChangeText={setQuery} placeholder="Texto dentro del codigo (opcional)" />
            <Text style={styles.meta}>{titleHint}</Text>
            {canSearch ? <Text style={styles.metaStrong}>{total} resultados</Text> : null}
            {isLoading ? <Text style={styles.loadingText}>Cargando codigos...</Text> : null}
            {isError ? <Text style={styles.errorText}>No se pudieron cargar codigos.</Text> : null}
            {!canSearch ? <Text style={styles.meta}>Selecciona el filtro para mostrar resultados.</Text> : null}
          </View>
        }
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
        ListFooterComponent={
          canSearch && hasNextPage ? (
            <Pressable style={styles.loadMore} onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
              <Text style={styles.loadMoreText}>{isFetchingNextPage ? "Cargando..." : "Cargar mas"}</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
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
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.small + 1,
  },
  scopeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  scopeBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  scopeBtnActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  scopeBtnText: {
    color: colors.muted,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  scopeBtnTextActive: {
    color: colors.primaryStrong,
  },
  accordionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  accordionTitle: {
    color: colors.text,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  accordionToggle: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  chipInactive: {
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
  },
  chipText: {
    fontSize: typography.small + 1,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.primaryStrong,
  },
  chipTextInactive: {
    color: colors.text,
  },
  meta: {
    color: colors.muted,
    fontSize: typography.small + 1,
  },
  metaStrong: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  loadingText: {
    color: colors.muted,
    fontSize: typography.small + 1,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  loadMore: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    borderRadius: radius.sm,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EEFF",
  },
  loadMoreText: {
    color: colors.primaryStrong,
    fontSize: typography.body,
    fontWeight: "700",
  },
});
