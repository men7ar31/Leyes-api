import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSaijDocument } from "./saijApi";
import type { SaijDocument, SaijSearchHit } from "../types/saij";

const FAVORITES_KEY = "saij_favorites_v1";

export type FavoriteItem = {
  guid: string;
  title: string;
  subtitle: string | null;
  contentType: string;
  savedAt: string;
  offlineReady: boolean;
  snapshot: SaijDocument | null;
};

const normalizeGuid = (value?: string | null) => String(value || "").trim();

const sortFavorites = (items: FavoriteItem[]) =>
  [...items].sort((a, b) => {
    const ta = Date.parse(a.savedAt || "");
    const tb = Date.parse(b.savedAt || "");
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

export const loadFavorites = async (): Promise<FavoriteItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteItem[];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((item) => normalizeGuid(item?.guid).length > 0);
    return sortFavorites(valid);
  } catch {
    return [];
  }
};

const saveFavorites = async (items: FavoriteItem[]) => {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(sortFavorites(items)));
};

export const getFavoriteByGuid = async (guid?: string | null) => {
  const key = normalizeGuid(guid);
  if (!key) return null;
  const list = await loadFavorites();
  return list.find((item) => normalizeGuid(item.guid) === key) || null;
};

export const isFavoriteGuid = async (guid?: string | null) => {
  const item = await getFavoriteByGuid(guid);
  return Boolean(item);
};

export const removeFavoriteByGuid = async (guid?: string | null) => {
  const key = normalizeGuid(guid);
  if (!key) return { favorites: await loadFavorites(), removed: false };
  const list = await loadFavorites();
  const next = list.filter((item) => normalizeGuid(item.guid) !== key);
  const removed = next.length !== list.length;
  if (removed) await saveFavorites(next);
  return { favorites: next, removed };
};

export const upsertFavoriteFromDocument = async (document: SaijDocument) => {
  const key = normalizeGuid(document.guid);
  if (!key) return { favorites: await loadFavorites(), added: false };
  const list = await loadFavorites();
  const nextItem: FavoriteItem = {
    guid: key,
    title: String(document.title || "").trim(),
    subtitle: (typeof document.subtitle === "string" && document.subtitle.trim()) || null,
    contentType: String(document.contentType || "").trim(),
    savedAt: new Date().toISOString(),
    offlineReady: true,
    snapshot: document,
  };
  const next = [nextItem, ...list.filter((item) => normalizeGuid(item.guid) !== key)];
  await saveFavorites(next);
  const added = !list.some((item) => normalizeGuid(item.guid) === key);
  return { favorites: next, added };
};

export const addFavoriteFromSearchHit = async (hit: SaijSearchHit) => {
  const key = normalizeGuid(hit.guid);
  if (!key) return { favorites: await loadFavorites(), added: false, offlineReady: false };

  const existing = await getFavoriteByGuid(key);
  if (existing) return { favorites: await loadFavorites(), added: false, offlineReady: Boolean(existing.offlineReady) };

  let snapshot: SaijDocument | null = null;
  try {
    const response = await getSaijDocument(key);
    snapshot = response?.document || null;
  } catch {
    snapshot = null;
  }

  const list = await loadFavorites();
  const nextItem: FavoriteItem = {
    guid: key,
    title: String(hit.title || "").trim(),
    subtitle: (typeof hit.subtitle === "string" && hit.subtitle.trim()) || null,
    contentType: String(hit.contentType || "").trim(),
    savedAt: new Date().toISOString(),
    offlineReady: Boolean(snapshot),
    snapshot,
  };
  const next = [nextItem, ...list.filter((item) => normalizeGuid(item.guid) !== key)];
  await saveFavorites(next);
  return { favorites: next, added: true, offlineReady: Boolean(snapshot) };
};

export const toggleFavoriteFromDocument = async (document: SaijDocument) => {
  const key = normalizeGuid(document.guid);
  if (!key) return { favorites: await loadFavorites(), isFavorite: false };
  const existing = await getFavoriteByGuid(key);
  if (existing) {
    const { favorites } = await removeFavoriteByGuid(key);
    return { favorites, isFavorite: false };
  }
  const { favorites } = await upsertFavoriteFromDocument(document);
  return { favorites, isFavorite: true };
};

