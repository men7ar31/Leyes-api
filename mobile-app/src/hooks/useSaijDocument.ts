import { useQuery } from "@tanstack/react-query";
import { getSaijDocument } from "../services/saijApi";
import { getFavoriteByGuid, getFavoriteOfflineDocument, hydrateFavoriteOfflineDocument } from "../services/favorites";
import type { SaijDocumentResponse } from "../types/saij";

export const useSaijDocument = (guid?: string) => {
  const normalizedGuid = String(guid || "").trim();

  const query = useQuery<SaijDocumentResponse>({
    queryKey: ["saij-document", normalizedGuid],
    enabled: normalizedGuid.length > 0,
    staleTime: 0,
    gcTime: 1000 * 60 * 60 * 4,
    retry: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      try {
        const response = await getSaijDocument(normalizedGuid, { signal, timeoutMs: 30000 });
        hydrateFavoriteOfflineDocument(response?.document).catch(() => {
          // offline warm-up should not block the document view
        });
        return response;
      } catch (error) {
        const [offlineDocument, fallback] = await Promise.all([
          getFavoriteOfflineDocument(normalizedGuid),
          getFavoriteByGuid(normalizedGuid),
        ]);
        if (offlineDocument) {
          return {
            ok: true,
            document: offlineDocument,
          };
        }
        if (fallback?.snapshot) {
          return {
            ok: true,
            document: fallback.snapshot,
          };
        }
        throw error;
      }
    },
  });

  return {
    document: query.data?.document,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
