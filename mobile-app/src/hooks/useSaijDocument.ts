import { useQuery } from "@tanstack/react-query";
import { getSaijDocument } from "../services/saijApi";
import { getFavoriteByGuid, getFavoriteOfflineDocument } from "../services/favorites";
import type { SaijDocumentResponse } from "../types/saij";

export const useSaijDocument = (guid?: string) => {
  const query = useQuery<SaijDocumentResponse>({
    queryKey: ["saij-document", guid],
    enabled: !!guid,
    staleTime: 1000 * 60 * 20,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const key = guid as string;
      try {
        return await getSaijDocument(key);
      } catch (error) {
        const offlineDocument = await getFavoriteOfflineDocument(key);
        if (offlineDocument) {
          return {
            ok: true,
            document: offlineDocument,
          };
        }
        const fallback = await getFavoriteByGuid(key);
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
