import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Heart, Trash2 } from "lucide-react-native";
import { radius, shadows, spacing, typography } from "../constants/theme";
import { formatDate } from "../utils/format";
import { type FavoriteItem, loadFavorites, removeFavoriteByGuid } from "../services/favorites";
import { useAppTheme } from "../theme/appTheme";
import { AppHeader } from "../components/AppHeader";
import { EmptyState } from "../components/EmptyState";
import { FullScreenLoader } from "../components/FullScreenLoader";
import { OfflineBanner } from "../components/OfflineBanner";

export const FavoritesScreen = () => {
  const { colors } = useAppTheme();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const list = await loadFavorites();
    setItems(list);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const openDetail = (guid: string) => {
    router.push({
      pathname: "/detail/[guid]",
      params: { guid },
    });
  };

  const removeItem = async (guid: string) => {
    const result = await removeFavoriteByGuid(guid);
    setItems(result.favorites);
  };

  if (isLoading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AppHeader title="Favoritos" />
        <FullScreenLoader message="Cargando favoritos..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AppHeader title="Favoritos" />

      <View style={styles.contentWrap}>
        <OfflineBanner text="Disponible sin conexión cuando exista snapshot" />

        <FlatList
          data={items}
          keyExtractor={(item) => item.guid}
          contentContainerStyle={[styles.listContent, items.length === 0 ? styles.listContentEmpty : null]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
                shadows.card,
                pressed ? styles.cardPressed : null,
              ]}
              onPress={() => openDetail(item.guid)}
            >
              <View style={styles.rowBetween}>
                <View style={[styles.typeBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.primaryStrong }]}>
                    {item.contentType || "legislacion"}
                  </Text>
                </View>
                <Text style={[styles.offlineText, { color: item.offlineReady ? colors.success : colors.muted }]}>
                  {item.offlineReady ? "Offline" : "Sin snapshot"}
                </Text>
              </View>

              <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={3}>
                {item.title || "Sin titulo"}
              </Text>

              {item.subtitle ? (
                <Text style={[styles.itemSubtitle, { color: colors.muted }]} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              ) : null}

              <View style={styles.rowBetween}>
                <Text style={[styles.savedAt, { color: colors.muted }]}>
                  Guardado: {formatDate(item.savedAt) || item.savedAt}
                </Text>

                <Pressable
                  onPress={() => removeItem(item.guid)}
                  style={({ pressed }) => [
                    styles.removeBtn,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    pressed ? styles.removeBtnPressed : null,
                  ]}
                >
                  <Trash2 size={15} color={colors.danger} strokeWidth={2} />
                  <Text style={[styles.removeBtnText, { color: colors.danger }]}>Quitar</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={Heart}
              message="No tenés favoritos guardados"
              hint="Agregá desde resultados o desde la vista de cada ley."
            />
          }
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: "center",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardPressed: {
    opacity: 0.9,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  itemTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  itemSubtitle: {
    fontSize: typography.body,
    lineHeight: 19,
  },
  offlineText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  savedAt: {
    flex: 1,
    fontSize: typography.small,
  },
  removeBtn: {
    minHeight: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  removeBtnPressed: {
    opacity: 0.82,
  },
  removeBtnText: {
    fontWeight: "700",
    fontSize: typography.small,
  },
});
