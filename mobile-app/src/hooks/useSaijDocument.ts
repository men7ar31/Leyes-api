import { useQuery } from "@tanstack/react-query";
import { getSaijDocument } from "../services/saijApi";
import { getFavoriteByGuid } from "../services/favorites";
import type { SaijDocumentResponse } from "../types/saij";

export const useSaijDocument = (guid?: string) => {
  const query = useQuery<SaijDocumentResponse>({
    queryKey: ["saij-document", guid],
    enabled: !!guid,
    queryFn: async () => {
      const key = guid as string;
      try {
        return await getSaijDocument(key);
      } catch (error) {
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

