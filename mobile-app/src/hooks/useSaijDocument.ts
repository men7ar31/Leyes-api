import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSaijDocument } from "../services/saijApi";
import { getFavoriteByGuid, getFavoriteOfflineDocument, hydrateFavoriteOfflineDocument } from "../services/favorites";
import type { SaijDocumentResponse } from "../types/saij";

export const useSaijDocument = (guid?: string) => {
  const queryClient = useQueryClient();
  const normalizedGuid = String(guid || "").trim();

  useEffect(() => {
    if (!normalizedGuid) return;
    return () => {
      queryClient.cancelQueries({ queryKey: ["saij-document", normalizedGuid], exact: true }).catch(() => {
        // best effort cancel on leave
      });
    };
  }, [normalizedGuid, queryClient]);

  const query = useQuery<SaijDocumentResponse>({
    queryKey: ["saij-document", normalizedGuid],
    enabled: normalizedGuid.length > 0,
    staleTime: 1000 * 60 * 20,
    gcTime: 1000 * 60 * 60,
    retry: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      try {
        const response = await getSaijDocument(normalizedGuid, { signal, timeoutMs: 35000 });
        hydrateFavoriteOfflineDocument(response?.document).catch(() => {
          // offline warm-up should not block the document view
        });
        return response;
      } catch (error) {
        const offlineDocument = await getFavoriteOfflineDocument(normalizedGuid);
        if (offlineDocument) {
          return {
            ok: true,
            document: offlineDocument,
          };
        }
        const fallback = await getFavoriteByGuid(normalizedGuid);
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
