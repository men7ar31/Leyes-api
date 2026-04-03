import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getSaijDocument } from "./saijApi";
import type { SaijDocument, SaijSearchHit } from "../types/saij";
import { resolveJurisdictionLabel } from "../utils/jurisdiction";

const FAVORITES_KEY = "saij_favorites_v1";
const FAVORITES_OFFLINE_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}favorites-offline`;

export type FavoriteSnapshot = SaijDocument;

export type FavoriteItem = {
  guid: string;
  title: string;
  subtitle: string | null;
  contentType: string;
  jurisdiction: string | null;
  savedAt: string;
  offlineReady: boolean;
  snapshot: FavoriteSnapshot | null;
};

const normalizeGuid = (value?: string | null) => String(value || "").trim();

const getFavoriteOfflinePath = (guid?: string | null) => {
  const normalizedGuid = normalizeGuid(guid);
  if (!normalizedGuid || !FAVORITES_OFFLINE_DIR) return null;
  return `${FAVORITES_OFFLINE_DIR}/${encodeURIComponent(normalizedGuid)}.json`;
};

const ensureFavoritesOfflineDir = async () => {
  if (!FAVORITES_OFFLINE_DIR) return false;
  try {
    await FileSystem.makeDirectoryAsync(FAVORITES_OFFLINE_DIR, { intermediates: true });
    return true;
  } catch {
    return false;
  }
};

const sortFavorites = (items: FavoriteItem[]) =>
  [...items].sort((a, b) => {
    const ta = Date.parse(a.savedAt || "");
    const tb = Date.parse(b.savedAt || "");
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

const buildFavoriteSnapshot = (document: SaijDocument | null | undefined): FavoriteSnapshot | null => {
  if (!document || !normalizeGuid(document.guid)) return null;
  return {
    guid: normalizeGuid(document.guid),
    title: String(document.title || "").trim(),
    subtitle: (typeof document.subtitle === "string" && document.subtitle.trim()) || null,
    contentType: String(document.contentType || "").trim(),
    metadata: document.metadata ?? {},
    numeroNorma: typeof document.numeroNorma === "string" ? document.numeroNorma : null,
    tipoNorma: typeof document.tipoNorma === "string" ? document.tipoNorma : null,
    documentSubtype: typeof document.documentSubtype === "string" ? document.documentSubtype : null,
    smartCitation: document.smartCitation ?? null,
    estadoVigencia: typeof document.estadoVigencia === "string" ? document.estadoVigencia : null,
    tribunal: typeof document.tribunal === "string" ? document.tribunal : null,
    fechaSentencia: typeof document.fechaSentencia === "string" ? document.fechaSentencia : null,
    autor: typeof document.autor === "string" ? document.autor : null,
    organismo: typeof document.organismo === "string" ? document.organismo : null,
    contentHtml: null,
    contentText: null,
    headerText: null,
    articles: [],
    toc: [],
    friendlyUrl: typeof document.friendlyUrl === "string" ? document.friendlyUrl : null,
    sourceUrl: typeof document.sourceUrl === "string" ? document.sourceUrl : null,
    attachment: null,
    normasQueModifica: [],
    normasComplementarias: [],
    observaciones: [],
    relatedFallos: [],
    relatedContents: [],
    fetchedAt: typeof document.fetchedAt === "string" ? document.fetchedAt : new Date().toISOString(),
    fromCache: true,
    hasRenderableContent: false,
    contentUnavailableReason: "favorite_snapshot_only",
  };
};

const persistFavoriteOfflineDocument = async (document: SaijDocument | null | undefined) => {
  const normalizedGuid = normalizeGuid(document?.guid);
  const fileUri = getFavoriteOfflinePath(normalizedGuid);
  if (!document || !normalizedGuid || !fileUri) return false;
  const canWrite = await ensureFavoritesOfflineDir();
  if (!canWrite) return false;

  try {
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(document), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const info = await FileSystem.getInfoAsync(fileUri);
    return Boolean(info.exists && Number(info.size || 0) > 32);
  } catch {
    return false;
  }
};

export const getFavoriteOfflineDocument = async (guid?: string | null): Promise<SaijDocument | null> => {
  const fileUri = getFavoriteOfflinePath(guid);
  if (!fileUri) return null;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || Number(info.size || 0) < 32) return null;
    const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaijDocument;
    return normalizeGuid(parsed?.guid) ? parsed : null;
  } catch {
    return null;
  }
};

const deleteFavoriteOfflineDocument = async (guid?: string | null) => {
  const fileUri = getFavoriteOfflinePath(guid);
  if (!fileUri) return;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch {
    // ignore cleanup errors
  }
};

export const loadFavorites = async (): Promise<FavoriteItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteItem[];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .filter((item) => normalizeGuid(item?.guid).length > 0)
      .map((item) => {
        const normalized: FavoriteItem = {
          guid: normalizeGuid(item.guid),
          title: String(item.title || "").trim(),
          subtitle: (typeof item.subtitle === "string" && item.subtitle.trim()) || null,
          contentType: String(item.contentType || "").trim(),
          jurisdiction: (typeof (item as any).jurisdiction === "string" && (item as any).jurisdiction.trim()) || null,
          savedAt: String(item.savedAt || ""),
          offlineReady: Boolean(item.offlineReady),
          snapshot:
            item.snapshot && typeof item.snapshot === "object"
              ? {
                  guid: normalizeGuid((item.snapshot as any).guid || item.guid),
                  title: String((item.snapshot as any).title || item.title || "").trim(),
                  subtitle:
                    (typeof (item.snapshot as any).subtitle === "string" && (item.snapshot as any).subtitle.trim()) ||
                    (typeof item.subtitle === "string" && item.subtitle.trim()) ||
                    null,
                  contentType: String((item.snapshot as any).contentType || item.contentType || "").trim(),
                  metadata: (item.snapshot as any).metadata ?? {},
                  numeroNorma:
                    typeof (item.snapshot as any).numeroNorma === "string" ? (item.snapshot as any).numeroNorma : null,
                  tipoNorma:
                    typeof (item.snapshot as any).tipoNorma === "string" ? (item.snapshot as any).tipoNorma : null,
                  documentSubtype:
                    typeof (item.snapshot as any).documentSubtype === "string"
                      ? (item.snapshot as any).documentSubtype
                      : null,
                  smartCitation: (item.snapshot as any).smartCitation ?? null,
                  estadoVigencia:
                    typeof (item.snapshot as any).estadoVigencia === "string"
                      ? (item.snapshot as any).estadoVigencia
                      : null,
                  tribunal:
                    typeof (item.snapshot as any).tribunal === "string" ? (item.snapshot as any).tribunal : null,
                  fechaSentencia:
                    typeof (item.snapshot as any).fechaSentencia === "string"
                      ? (item.snapshot as any).fechaSentencia
                      : null,
                  autor: typeof (item.snapshot as any).autor === "string" ? (item.snapshot as any).autor : null,
                  organismo:
                    typeof (item.snapshot as any).organismo === "string" ? (item.snapshot as any).organismo : null,
                  contentHtml: null,
                  contentText: null,
                  headerText: null,
                  articles: [],
                  toc: [],
                  friendlyUrl:
                    typeof (item.snapshot as any).friendlyUrl === "string" ? (item.snapshot as any).friendlyUrl : null,
                  sourceUrl:
                    typeof (item.snapshot as any).sourceUrl === "string" ? (item.snapshot as any).sourceUrl : null,
                  attachment: null,
                  normasQueModifica: [],
                  normasComplementarias: [],
                  observaciones: [],
                  relatedFallos: [],
                  relatedContents: [],
                  fetchedAt:
                    typeof (item.snapshot as any).fetchedAt === "string"
                      ? (item.snapshot as any).fetchedAt
                      : new Date().toISOString(),
                  fromCache: true,
                  hasRenderableContent: false,
                  contentUnavailableReason: "favorite_snapshot_only",
                }
              : null,
        };

        if (!normalized.jurisdiction) {
          normalized.jurisdiction = resolveJurisdictionLabel({
            subtitle: normalized.subtitle,
            title: normalized.title,
            metadata: normalized.snapshot?.metadata,
          });
        }

        return normalized;
      });
    return sortFavorites(valid);
  } catch {
    return [];
  }
};

const saveFavorites = async (items: FavoriteItem[]) => {
  const normalized = sortFavorites(
    items.map((item) => ({
      ...item,
      snapshot: buildFavoriteSnapshot((item.snapshot as any) || null),
    }))
  );
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
  } catch {
    const fallback = normalized.map((item) => ({
      ...item,
      offlineReady: false,
      snapshot: null,
    }));
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(fallback));
  }
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
  if (removed) {
    await saveFavorites(next);
    await deleteFavoriteOfflineDocument(key);
  }
  return { favorites: next, removed };
};

export const upsertFavoriteFromDocument = async (document: SaijDocument) => {
  const key = normalizeGuid(document.guid);
  if (!key) return { favorites: await loadFavorites(), added: false };
  const list = await loadFavorites();
  const offlineReady = await persistFavoriteOfflineDocument(document);
  const nextItem: FavoriteItem = {
    guid: key,
    title: String(document.title || "").trim(),
    subtitle: (typeof document.subtitle === "string" && document.subtitle.trim()) || null,
    contentType: String(document.contentType || "").trim(),
    jurisdiction: resolveJurisdictionLabel({
      subtitle: document.subtitle,
      title: document.title,
      metadata: document.metadata,
    }),
    savedAt: new Date().toISOString(),
    offlineReady,
    snapshot: buildFavoriteSnapshot(document),
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
  let offlineReady = false;
  try {
    const response = await getSaijDocument(key);
    snapshot = response?.document || null;
    offlineReady = await persistFavoriteOfflineDocument(snapshot);
  } catch {
    snapshot = null;
    offlineReady = false;
  }

  const list = await loadFavorites();
  const nextItem: FavoriteItem = {
    guid: key,
    title: String(hit.title || "").trim(),
    subtitle: (typeof hit.subtitle === "string" && hit.subtitle.trim()) || null,
    contentType: String(hit.contentType || "").trim(),
    jurisdiction: resolveJurisdictionLabel({
      jurisdiccion: hit.jurisdiccion,
      subtitle: hit.subtitle,
      title: hit.title,
      summary: hit.summary,
      metadata: snapshot?.metadata,
    }),
    savedAt: new Date().toISOString(),
    offlineReady,
    snapshot: buildFavoriteSnapshot(snapshot),
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
