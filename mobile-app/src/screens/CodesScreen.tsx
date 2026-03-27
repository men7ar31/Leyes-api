import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { colors, radius, spacing, typography } from "../constants/theme";
import { PROVINCIAL_CODES_CATALOG, type ProvincialCodeCatalogEntry } from "../constants/provincialCodesCatalog";
import { useSaijSearch } from "../hooks/useSaijSearch";
import { getSaijDocument, resolveProvincialCode } from "../services/saijApi";
import { useAppTheme } from "../theme/appTheme";

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

const getCatalogEntryKey = (province: string, entry: ProvincialCodeCatalogEntry) =>
  [normalize(province), normalize(entry.area), normalize(entry.reference), normalize(entry.numeroNorma || "")].join("|");

export const CodesScreen = () => {
  const { colors: appColors, isDarkMode } = useAppTheme();
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
    (province: string, entry: ProvincialCodeCatalogEntry) => [
      "saij-provincial-code-resolve",
      getCatalogEntryKey(province, entry),
    ],
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
          staleTime: 1000 * 60 * 5,
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
    router.push({
      pathname: "/detail/[guid]",
      params: { guid: normalizedGuid, fromCodes: "1" },
    });
    setTimeout(() => {
      if (openingGuidRef.current === normalizedGuid) {
        openingGuidRef.current = null;
      }
    }, 200);
  }, []);

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
          Alert.alert("Codigo no encontrado", "No pudimos abrir ese codigo ahora.");
          return;
        }
        prefetchCode(guid);
        openCode(guid);
      } catch {
        Alert.alert("Codigo no encontrado", "No pudimos abrir ese codigo ahora.");
      } finally {
        setTimeout(() => {
          if (openingEntryRef.current === entryKey) {
            openingEntryRef.current = null;
          }
        }, 140);
      }
    },
    [openCode, prefetchCode, queryClient, resolveQueryKeyForEntry, selectedProvince]
  );

  useEffect(() => {
    const candidates = nationalCodes.slice(0, 3);
    candidates.forEach((item) => prefetchCode(item.guid));
  }, [nationalCodes, prefetchCode]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: appColors.background }]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: appColors.text }]}>Codigos</Text>
          <Text style={[styles.subtitle, { color: appColors.muted }]}>Lista curada por provincia y apertura directa.</Text>
        </View>

        <View style={styles.scopeGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.scopeSquareBtn,
              {
                borderColor: appColors.border,
                backgroundColor: appColors.card,
              },
              scope === "nacional" ? styles.scopeSquareBtnActive : null,
              pressed ? styles.scopeSquareBtnPressed : null,
            ]}
            onPress={() => {
              setScope("nacional");
              setIsProvinceListOpen(true);
            }}
          >
            <Text
              style={[
                styles.scopeSquareText,
                { color: appColors.muted },
                scope === "nacional" ? [styles.scopeSquareTextActive, { color: appColors.primaryStrong }] : null,
              ]}
            >
              Nacionales
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.scopeSquareBtn,
              {
                borderColor: appColors.border,
                backgroundColor: appColors.card,
              },
              scope === "provincial" ? styles.scopeSquareBtnActive : null,
              pressed ? styles.scopeSquareBtnPressed : null,
            ]}
            onPress={() => {
              setScope("provincial");
              setIsProvinceListOpen(true);
            }}
          >
            <Text
              style={[
                styles.scopeSquareText,
                { color: appColors.muted },
                scope === "provincial" ? [styles.scopeSquareTextActive, { color: appColors.primaryStrong }] : null,
              ]}
            >
              Provinciales
            </Text>
          </Pressable>
        </View>

        {scope === "nacional" ? (
          <View style={[styles.block, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
            <Text style={[styles.blockTitle, { color: appColors.text }]}>Codigos nacionales</Text>
            {isNationalLoading ? <Text style={[styles.meta, { color: appColors.muted }]}>Cargando lista...</Text> : null}
            {isNationalError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>No se pudo actualizar la lista nacional.</Text>
                <Pressable style={styles.retryBtn} onPress={() => refetchNational()}>
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}
            {!isNationalLoading && !isNationalError && nationalCodes.length === 0 ? (
              <Text style={[styles.meta, { color: appColors.muted }]}>Sin codigos nacionales disponibles.</Text>
            ) : null}
            {!isNationalLoading && !isNationalError
              ? nationalCodes.map((code) => (
                  <Pressable
                    key={code.guid}
                    style={({ pressed }) => [
                      styles.rowItem,
                      { backgroundColor: isDarkMode ? "#111B33" : "#F8FAFC", borderColor: appColors.border },
                      pressed ? styles.rowItemPressed : null,
                    ]}
                    android_ripple={{ color: "#DCE6FF" }}
                    onPress={() => openCode(code.guid)}
                  >
                    <Text style={[styles.rowItemText, { color: appColors.text }]}>{code.title}</Text>
                    <Text style={[styles.rowItemArrow, { color: appColors.primaryStrong }]}>{"\u203A"}</Text>
                  </Pressable>
                ))
              : null}
          </View>
        ) : (
          <View style={[styles.block, { backgroundColor: appColors.card, borderColor: appColors.border }]}>
            <View style={styles.provinceHeaderRow}>
              <Text style={[styles.blockTitle, { color: appColors.text }]}>
                Provincia{selectedProvince ? `: ${selectedProvince}` : " (A-Z)"}
              </Text>
              <Pressable onPress={() => setIsProvinceListOpen((prev) => !prev)}>
                <Text style={[styles.provinceToggle, { color: appColors.primaryStrong }]}>
                  {isProvinceListOpen ? "Ocultar" : "Cambiar"}
                </Text>
              </Pressable>
            </View>

            {isProvinceListOpen ? (
              <View style={styles.provinceGrid}>
                {PROVINCES.map((province) => (
                  <Pressable
                    key={province.name}
                    style={({ pressed }) => [
                      styles.provinceChip,
                      { borderColor: appColors.border, backgroundColor: isDarkMode ? "#111B33" : "#F8FAFC" },
                      selectedProvince === province.name ? styles.provinceChipActive : null,
                      pressed ? styles.provinceChipPressed : null,
                    ]}
                    onPress={() => {
                      setSelectedProvince(province.name);
                      setIsProvinceListOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.provinceChipText,
                        { color: appColors.text },
                        selectedProvince === province.name ? styles.provinceChipTextActive : null,
                      ]}
                    >
                      {province.abbr}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {canLoadProvincialList ? (
              <View style={styles.subBlock}>
                <Text style={[styles.blockTitle, { color: appColors.text }]}>Codigos provinciales ({selectedProvince})</Text>
                {provincialCatalog.length === 0 ? (
                  <Text style={[styles.meta, { color: appColors.muted }]}>Sin codigos para esta provincia.</Text>
                ) : null}
                {provincialCatalog.map((entry) => {
                  const rowKey = getCatalogEntryKey(selectedProvince, entry);
                  return (
                    <Pressable
                      key={rowKey}
                      style={({ pressed }) => [
                        styles.rowItem,
                        { backgroundColor: isDarkMode ? "#111B33" : "#F8FAFC", borderColor: appColors.border },
                        pressed ? styles.rowItemPressed : null,
                      ]}
                      android_ripple={{ color: "#DCE6FF" }}
                      onPress={() => resolveAndOpenProvincialCode(entry)}
                    >
                      <View style={styles.rowItemBody}>
                        <Text style={[styles.rowItemText, { color: appColors.text }]} numberOfLines={2}>
                          {entry.area}
                        </Text>
                        <Text style={[styles.rowItemMeta, { color: appColors.muted }]}>{entry.reference}</Text>
                      </View>
                      <Text style={[styles.rowItemArrow, { color: appColors.primaryStrong }]}>{"\u203A"}</Text>
                    </Pressable>
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
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
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
  scopeGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  scopeSquareBtn: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  scopeSquareBtnActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  scopeSquareBtnPressed: {
    backgroundColor: "#EEF3FF",
  },
  scopeSquareText: {
    color: colors.muted,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "center",
  },
  scopeSquareTextActive: {
    color: colors.primaryStrong,
  },
  block: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  provinceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  provinceToggle: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  blockTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  provinceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  provinceChip: {
    width: "22.8%",
    minHeight: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  provinceChipActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#E8EEFF",
  },
  provinceChipPressed: {
    backgroundColor: "#EEF3FF",
  },
  provinceChipText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
  },
  provinceChipTextActive: {
    color: colors.primaryStrong,
  },
  subBlock: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  rowItem: {
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowItemPressed: {
    borderColor: colors.primaryStrong,
    backgroundColor: "#EDF2FF",
  },
  rowItemBody: {
    flex: 1,
    gap: 2,
  },
  rowItemText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  rowItemMeta: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: "600",
  },
  rowItemArrow: {
    color: colors.primaryStrong,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "700",
  },
  meta: {
    color: colors.muted,
    fontSize: typography.small + 1,
  },
  errorWrap: {
    gap: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
  retryBtn: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    borderRadius: radius.sm,
    backgroundColor: "#E8EEFF",
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  retryBtnText: {
    color: colors.primaryStrong,
    fontSize: typography.small + 1,
    fontWeight: "700",
  },
});
