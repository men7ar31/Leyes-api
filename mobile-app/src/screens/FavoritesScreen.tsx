import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { colors, radius, spacing, typography } from "../constants/theme";
import { formatDate } from "../utils/format";
import { type FavoriteItem, loadFavorites, removeFavoriteByGuid } from "../services/favorites";

export const FavoritesScreen = () => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Favoritos</Text>
        <Text style={styles.subtitle}>Disponibles sin conexion cuando tengan snapshot guardado.</Text>
      </View>

      {isLoading ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Cargando favoritos...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.guid}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openDetail(item.guid)}>
              <View style={styles.row}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.contentType || "legislacion"}</Text>
                </View>
                <Text style={styles.offlineText}>{item.offlineReady ? "Offline listo" : "Sin snapshot offline"}</Text>
              </View>
              <Text style={styles.itemTitle}>{item.title || "Sin titulo"}</Text>
              {item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
              <View style={styles.rowBetween}>
                <Text style={styles.savedAt}>Guardado: {formatDate(item.savedAt) || item.savedAt}</Text>
                <Pressable onPress={() => removeItem(item.guid)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Quitar</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No hay favoritos guardados.</Text>
              <Text style={styles.emptyHint}>
                Desliza a la derecha en resultados o usa el menu de tres puntos en el detalle.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  rowBetween: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.badgeBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: colors.badgeText,
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  itemTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  itemSubtitle: {
    color: colors.muted,
    fontSize: typography.body,
  },
  offlineText: {
    color: colors.primaryStrong,
    fontSize: typography.small,
    fontWeight: "600",
  },
  savedAt: {
    color: colors.muted,
    fontSize: typography.small,
  },
  removeBtn: {
    borderWidth: 1,
    borderColor: "#F2C7C7",
    backgroundColor: "#FFF5F5",
    borderRadius: radius.sm,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: typography.small + 1,
  },
  emptyWrap: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyText: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyHint: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: "center",
  },
});
