import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { radius, spacing, typography } from "../constants/theme";
import { PROVINCIAL_CODES_CATALOG, type ProvincialCodeCatalogEntry } from "../constants/provincialCodesCatalog";
import { useSaijSearch } from "../hooks/useSaijSearch";
import { getSaijDocument, resolveProvincialCode } from "../services/saijApi";
import { useAppTheme } from "../theme/appTheme";
import { AppHeader } from "../components/AppHeader";
import { CodeCard } from "../components/CodeCard";
import { EmptyState } from "../components/EmptyState";
import { FullScreenLoader } from "../components/FullScreenLoader";
import { ProvinceCard } from "../components/ProvinceCard";
import { SegmentedTabs } from "../components/SegmentedTabs";

type CodesScope = "nacional" | "provincial";

type ProvinceOption = {
  name: string;
  abbr: string;
};

const PROVINCES: ProvinceOption[] = [
  { name: "Buenos Aires", abbr: "BA" },
  { name: "Catamarca", abbr: "CAT" },
  { name: "Chaco", abbr: "CHA" },
  { name: "Chubut", abbr: "CHU" },
  { name: "Ciudad Autonoma de Buenos Aires", abbr: "CABA" },
  { name: "Cordoba", abbr: "CBA" },
  { name: "Corrientes", abbr: "CTES" },
  { name: "Entre Rios", abbr: "ER" },
  { name: "Formosa", abbr: "FOR" },
  { name: "Jujuy", abbr: "JUJ" },
  { name: "La Pampa", abbr: "LP" },
  { name: "La Rioja", abbr: "LR" },
  { name: "Mendoza", abbr: "MZA" },
  { name: "Misiones", abbr: "MIS" },
  { name: "Neuquen", abbr: "NQN" },
  { name: "Rio Negro", abbr: "RN" },
  { name: "Salta", abbr: "SAL" },
  { name: "San Juan", abbr: "SJ" },
  { name: "San Luis", abbr: "SL" },
  { name: "Santa Cruz", abbr: "SC" },
  { name: "Santa Fe", abbr: "SF" },
  { name: "Santiago del Estero", abbr: "SDE" },
  { name: "Tierra del Fuego", abbr: "TDF" },
  { name: "Tucuman", abbr: "TUC" },
].sort((a, b) => a.name.localeCompare(b.name, "es"));

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCodeTitle = (value: string) =>
  normalize(value)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const shouldExcludeNationalCode = (hit: { title?: string | null; subtitle?: string | null; estado?: string | null; summary?: string | null }) => {
  const title = normalize(String(hit.title || ""));
  const subtitle = normalize(String(hit.subtitle || ""));
  const estado = normalize(String(hit.estado || ""));
  const summary = normalize(String(hit.summary || ""));
  const bag = `${title} ${subtitle} ${estado} ${summary}`.trim();
  const bagCode = normalizeCodeTitle(bag);

  if (/\bderogad\w*\b/i.test(bag)) return true;

  if (bagCode.includes("codigo civil") && !bagCode.includes("codigo civil y comercial")) return true;
  if (bagCode.includes("codigo de comercio")) return true;

  if (bagCode.includes("codigo procesal penal federal") && !/\b(t\.?\s*o\.?\s*2019|texto ordenado 2019)\b/i.test(bag)) {
    return true;
  }

  return false;
};

const getCatalogEntryKey = (province: string, entry: ProvincialCodeCatalogEntry) =>
  [normalize(province), normalize(entry.area), normalize(entry.reference), normalize(entry.numeroNorma || "")].join("|");

const getManualLawSearchHint = (entry: ProvincialCodeCatalogEntry) => {
  const fromNumeroNorma = String(entry.numeroNorma || "")
    .replace(/[^\d]/g, "")
    .trim();
  if (fromNumeroNorma) return `Ley ${fromNumeroNorma}`;

  const fromReference = String(entry.reference || "").match(/\d{2,7}/)?.[0] || "";
  if (fromReference) return `Ley ${fromReference}`;

  return null;
};

export const CodesScreen = () => {
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<CodesScope>("nacional");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [isProvinceListOpen, setIsProvinceListOpen] = useState(true);
  const openingGuidRef = useRef<string | null>(null);
  const openingEntryRef = useRef<string | null>(null);

  const {
    items: nationalRawItems,
    isLoading: isNationalLoading,
    isError: isNationalError,
    refetch: refetchNational,
  } = useSaijSearch({
    contentType: "legislacion",
    filters: {
      tipoNorma: "codigo",
      jurisdiccion: { kind: "nacional" },
    },
    pageSize: 50,
    enabled: scope === "nacional",
  });

  const canLoadProvincialList = scope === "provincial" && selectedProvince.trim().length > 0;
  const canShowProvincialCodes = canLoadProvincialList && !isProvinceListOpen;
  const provincialCatalog = useMemo(
    () => (selectedProvince ? PROVINCIAL_CODES_CATALOG[selectedProvince] || [] : []),
    [selectedProvince]
  );

  const nationalCodes = useMemo(() => {
    const byGuid = new Map<string, (typeof nationalRawItems)[number]>();
    for (const hit of nationalRawItems) {
      const guid = String(hit.guid || "").trim();
      if (!guid) continue;
      const title = String(hit.title || "");
      if (!normalize(title).includes("codigo")) continue;
      if (shouldExcludeNationalCode(hit)) continue;
      if (!byGuid.has(guid)) byGuid.set(guid, hit);
    }

    const byTitle = new Map<string, (typeof nationalRawItems)[number]>();
    for (const hit of byGuid.values()) {
      const titleKey = normalizeCodeTitle(String(hit.title || ""));
      if (!titleKey) continue;
      if (!byTitle.has(titleKey)) byTitle.set(titleKey, hit);
    }

    return Array.from(byTitle.values()).sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "es"));
  }, [nationalRawItems]);

  const resolveQueryKeyForEntry = useCallback(
    (province: string, entry: ProvincialCodeCatalogEntry) => ["saij-provincial-code-resolve", getCatalogEntryKey(province, entry)],
    []
  );

  const prefetchCode = useCallback(
    (guid: string) => {
      const normalizedGuid = String(guid || "").trim();
      if (!normalizedGuid) return;
      queryClient
        .prefetchQuery({
          queryKey: ["saij-document", normalizedGuid],
          queryFn: () => getSaijDocument(normalizedGuid),
          staleTime: 1000 * 60 * 20,
          gcTime: 1000 * 60 * 60,
        })
        .catch(() => {
          // warm cache best effort
        });
    },
    [queryClient]
  );

  const prefetchProvincialCodeResolution = useCallback(
    (province: string, entry: ProvincialCodeCatalogEntry) => {
      if (!province) return;
      const resolveKey = resolveQueryKeyForEntry(province, entry);
      const cached = queryClient.getQueryData<Awaited<ReturnType<typeof resolveProvincialCode>>>(resolveKey);
      if (cached?.guid) {
        prefetchCode(cached.guid);
        return;
      }

      queryClient
        .prefetchQuery({
          queryKey: resolveKey,
          queryFn: () => resolveProvincialCode(province, entry),
          staleTime: 1000 * 60 * 30,
        })
        .then(() => {
          const resolved = queryClient.getQueryData<Awaited<ReturnType<typeof resolveProvincialCode>>>(resolveKey);
          if (resolved?.guid) {
            prefetchCode(resolved.guid);
          }
        })
        .catch(() => {
          // best effort warm-up
        });
    },
    [prefetchCode, queryClient, resolveQueryKeyForEntry]
  );

  const openCode = useCallback((guid: string) => {
    const normalizedGuid = String(guid || "").trim();
    if (!normalizedGuid) return;
    if (openingGuidRef.current === normalizedGuid) return;
    openingGuidRef.current = normalizedGuid;
    prefetchCode(normalizedGuid);
    router.push({
      pathname: "/detail/[guid]",
      params: { guid: normalizedGuid, fromCodes: "1" },
    });
    setTimeout(() => {
      if (openingGuidRef.current === normalizedGuid) {
        openingGuidRef.current = null;
      }
    }, 60);
  }, [prefetchCode]);

  const resolveAndOpenProvincialCode = useCallback(
    async (entry: ProvincialCodeCatalogEntry) => {
      if (!selectedProvince) return;
      const entryKey = getCatalogEntryKey(selectedProvince, entry);
      if (openingEntryRef.current === entryKey) return;
      openingEntryRef.current = entryKey;

      try {
        const resolveKey = resolveQueryKeyForEntry(selectedProvince, entry);
        let resolved = queryClient.getQueryData<Awaited<ReturnType<typeof resolveProvincialCode>>>(resolveKey) || null;
        if (!resolved?.guid) {
          resolved = await resolveProvincialCode(selectedProvince, entry);
          if (resolved?.guid) {
            queryClient.setQueryData(resolveKey, resolved);
          }
        }
        const guid = String(resolved?.guid || "").trim();
        if (!guid) {
          const manualHint = getManualLawSearchHint(entry);
          const message = manualHint
            ? `No pudimos abrir ese codigo ahora.\n\nIntente busqueda manual: ${manualHint}.`
            : "No pudimos abrir ese codigo ahora.";
          Alert.alert("Codigo no encontrado", message);
          return;
        }
        openCode(guid);
      } catch {
        const manualHint = getManualLawSearchHint(entry);
        const message = manualHint
          ? `No pudimos abrir ese codigo ahora.\n\nIntente busqueda manual: ${manualHint}.`
          : "No pudimos abrir ese codigo ahora.";
        Alert.alert("Codigo no encontrado", message);
      } finally {
        setTimeout(() => {
          if (openingEntryRef.current === entryKey) {
            openingEntryRef.current = null;
          }
        }, 60);
      }
    },
    [openCode, queryClient, resolveQueryKeyForEntry, selectedProvince]
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: colors.background }]}> 
      <AppHeader title="Codigos" subtitle="Nacionales y provinciales" />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SegmentedTabs
          options={[
            { label: "Nacionales", value: "nacional" },
            { label: "Provinciales", value: "provincial" },
          ]}
          value={scope}
          onChange={(value) => {
            setScope(value);
            if (value === "provincial") setIsProvinceListOpen(true);
          }}
        />

        {scope === "nacional" ? (
          <View style={[styles.block, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.blockTitle, { color: colors.text }]}>Codigos nacionales</Text>

            {isNationalLoading ? <FullScreenLoader message="Cargando codigos nacionales..." /> : null}

            {isNationalError ? (
              <View style={styles.errorWrap}>
                <Text style={[styles.errorText, { color: colors.danger }]}>No se pudo cargar la lista nacional.</Text>
                <Pressable
                  unstable_pressDelay={0}
                  android_ripple={{ color: colors.primarySoft, borderless: true }}
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: colors.border, backgroundColor: colors.primarySoft },
                    pressed ? styles.retryBtnPressed : null,
                  ]}
                  onPress={() => refetchNational()}
                >
                  <RefreshCw size={15} color={colors.primaryStrong} strokeWidth={2} />
                  <Text style={[styles.retryBtnText, { color: colors.primaryStrong }]}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}

            {!isNationalLoading && !isNationalError && nationalCodes.length === 0 ? (
              <EmptyState message="No hay codigos nacionales disponibles" />
            ) : null}

            {!isNationalLoading && !isNationalError
              ? nationalCodes.map((code) => (
                  <CodeCard
                    key={code.guid}
                    title={code.title}
                    subtitle={code.subtitle || undefined}
                    onPressIn={() => prefetchCode(code.guid)}
                    onPress={() => openCode(code.guid)}
                  />
                ))
              : null}
          </View>
        ) : (
          <View style={[styles.block, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.headerRow}>
              <Text style={[styles.blockTitle, { color: colors.text }]}>Provincia: {selectedProvince || "Seleccionar"}</Text>
              <Pressable
                onPress={() => setIsProvinceListOpen((prev) => !prev)}
                unstable_pressDelay={0}
                android_ripple={{ color: colors.primarySoft, borderless: true }}
                hitSlop={8}
              >
                <Text style={[styles.changeText, { color: colors.primaryStrong }]}>{isProvinceListOpen ? "Ocultar" : "Cambiar"}</Text>
              </Pressable>
            </View>

            {isProvinceListOpen ? (
              <View style={styles.provinceGrid}>
                {PROVINCES.map((province) => (
                  <View key={province.name} style={styles.provinceGridItem}>
                    <ProvinceCard
                      label={province.name}
                      abbr={province.abbr}
                      active={selectedProvince === province.name}
                      onPress={() => {
                        setSelectedProvince(province.name);
                        setIsProvinceListOpen(false);
                      }}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            {canShowProvincialCodes ? (
              <View style={styles.codesWrap}>
                {provincialCatalog.length === 0 ? (
                  <EmptyState message="Sin codigos para esta provincia" />
                ) : (
                  provincialCatalog.map((entry) => {
                    const rowKey = getCatalogEntryKey(selectedProvince, entry);
                    return (
                      <CodeCard
                        key={rowKey}
                        title={entry.area}
                        subtitle={entry.reference}
                        onPressIn={() => prefetchProvincialCodeResolution(selectedProvince, entry)}
                        onPress={() => resolveAndOpenProvincialCode(entry)}
                      />
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  block: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  blockTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  errorWrap: {
    gap: spacing.xs,
  },
  errorText: {
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  retryBtn: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  retryBtnPressed: {
    opacity: 0.84,
  },
  retryBtnText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  changeText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  provinceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  provinceGridItem: {
    width: "50%",
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  codesWrap: {
    gap: spacing.xs,
  },
});
