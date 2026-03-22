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
import type { SaijSearchFilters, SaijSearchRequest } from "../types/saij";

const PAGE_SIZE = 20;

type FormState = {
  textoEnNorma: string;
  numeroNorma: string;
  contentType: SaijSearchRequest["contentType"];
  jurisdictionKind: "todas" | "nacional" | "provincial" | "internacional";
  province: string;
};

const initialState: FormState = {
  textoEnNorma: "",
  numeroNorma: "",
  contentType: "legislacion",
  jurisdictionKind: "todas",
  province: "",
};

export const SearchScreen = () => {
  const [formState, setFormState] = useState<FormState>(initialState);
  const [appliedState, setAppliedState] = useState<FormState>(initialState);
  const [hasSearched, setHasSearched] = useState(false);

  const filters = useMemo<SaijSearchFilters>(() => {
    const next: SaijSearchFilters = {};
    if (appliedState.textoEnNorma.trim()) next.textoEnNorma = appliedState.textoEnNorma.trim();
    if (appliedState.numeroNorma.trim()) next.numeroNorma = appliedState.numeroNorma.trim();

    if (appliedState.jurisdictionKind === "provincial") {
      next.jurisdiccion = {
        kind: "provincial",
        provincia: appliedState.province.trim(),
      };
    } else {
      next.jurisdiccion = { kind: appliedState.jurisdictionKind };
    }

    return next;
  }, [appliedState]);

  const {
    items,
    total,
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

  const onSearch = () => {
    setAppliedState({ ...formState });
    setHasSearched(true);
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
        data={items}
        keyExtractor={(item) => item.guid}
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
              onChangeContentType={(contentType) => setFormState((prev) => ({ ...prev, contentType }))}
              jurisdictionKind={formState.jurisdictionKind}
              onChangeJurisdictionKind={(jurisdictionKind) =>
                setFormState((prev) => ({ ...prev, jurisdictionKind }))
              }
              province={formState.province}
              onChangeProvince={(province) => setFormState((prev) => ({ ...prev, province }))}
            />

            {provinceRequired ? (
              <Text style={styles.warning}>Ingresa una provincia para buscar por jurisdiccion provincial.</Text>
            ) : null}

            <Pressable
              style={[styles.searchButton, provinceRequired ? styles.searchButtonDisabled : null]}
              onPress={onSearch}
              disabled={provinceRequired}
            >
              <Text style={styles.searchButtonText}>Buscar</Text>
            </Pressable>

            {hasSearched ? (
              <Text style={styles.totalText}>{total} resultados</Text>
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
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
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
