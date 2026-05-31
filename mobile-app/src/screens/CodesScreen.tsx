import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { radius, spacing, typography } from "../constants/theme";
import { getMainProvincialCodes, type ProvincialCodeCatalogEntry } from "../constants/provincialCodesCatalog";
import { useSaijSearch } from "../hooks/useSaijSearch";
import { getSaijDocument } from "../services/saijApi";
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

const DOCUMENT_OPEN_GUARD_MS = 900;

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

export const CodesScreen = () => {
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<CodesScope>("nacional");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [isProvinceListOpen, setIsProvinceListOpen] = useState(true);
  const [pendingCodeKey, setPendingCodeKey] = useState<string | null>(null);
  const openingGuidRef = useRef<string | null>(null);

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

  const canShowProvincialCodes = scope === "provincial" && selectedProvince.trim().length > 0 && !isProvinceListOpen;
  const provincialCatalog = useMemo(() => (selectedProvince ? getMainProvincialCodes(selectedProvince) : []), [selectedProvince]);

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

  const prefetchCode = useCallback(
    (guid: string) => {
      const normalizedGuid = String(guid || "").trim();
      if (!normalizedGuid) return;
      const queryState = queryClient.getQueryState(["saij-document", normalizedGuid]);
      if (queryState?.data || queryState?.fetchStatus === "fetching") return;
      queryClient
        .prefetchQuery({
          queryKey: ["saij-document", normalizedGuid],
          queryFn: () => getSaijDocument(normalizedGuid, { timeoutMs: 30000 }),
          staleTime: 1000 * 60 * 60,
          gcTime: 1000 * 60 * 60 * 4,
        })
        .catch(() => {
          // warm cache best effort
        });
    },
    [queryClient]
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
    startTransition(() => {
      setPendingCodeKey(normalizedGuid);
    });
    setTimeout(() => {
      setPendingCodeKey((current) => (current === normalizedGuid ? null : current));
    }, 220);
    setTimeout(() => {
      if (openingGuidRef.current === normalizedGuid) {
        openingGuidRef.current = null;
      }
    }, DOCUMENT_OPEN_GUARD_MS);
  }, [prefetchCode]);

  const invalidatePendingProvincialOpen = useCallback(() => {
    openingGuidRef.current = null;
    setPendingCodeKey(null);
  }, []);

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
            invalidatePendingProvincialOpen();
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
                    active={pendingCodeKey === code.guid}
                    onPressIn={() => setPendingCodeKey(code.guid)}
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
                onPress={() => {
                  invalidatePendingProvincialOpen();
                  setIsProvinceListOpen((prev) => !prev);
                }}
                unstable_pressDelay={0}
                android_ripple={{ color: colors.primarySoft, borderless: true }}
                hitSlop={8}
              >
                <Text style={[styles.changeText, { color: colors.primaryStrong }]}>{isProvinceListOpen ? "Volver" : "Cambiar"}</Text>
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
                        invalidatePendingProvincialOpen();
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
                {provincialCatalog.length === 0 ? <EmptyState message="Sin codigos para esta provincia" /> : null}
                {provincialCatalog.map((entry) => {
                  const rowKey = getCatalogEntryKey(selectedProvince, entry);
                  const subtitleParts = [entry.reference, entry.notes].filter(Boolean);
                  return (
                    <CodeCard
                      key={rowKey}
                      title={entry.area}
                      subtitle={subtitleParts.join(" · ")}
                      active={pendingCodeKey === rowKey}
                      onPressIn={() => setPendingCodeKey(rowKey)}
                      onPress={() => {
                        router.push({
                          pathname: "/detail/[guid]",
                          params: {
                            guid: "__provincial_pending__",
                            province: selectedProvince,
                            codeKey: rowKey,
                            pendingTitle: entry.area,
                            pendingReference: entry.reference,
                            fromCodes: "1",
                          },
                        });
                        startTransition(() => {
                          setPendingCodeKey(rowKey);
                        });
                        setTimeout(() => {
                          setPendingCodeKey((current) => (current === rowKey ? null : current));
                        }, 220);
                      }}
                    />
                  );
                })}
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
