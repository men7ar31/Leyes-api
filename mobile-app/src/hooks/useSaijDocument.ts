import { useQuery } from "@tanstack/react-query";
import { getSaijDocument } from "../services/saijApi";
import type { SaijDocumentResponse } from "../types/saij";

export const useSaijDocument = (guid?: string) => {
  const query = useQuery<SaijDocumentResponse>({
    queryKey: ["saij-document", guid],
    enabled: !!guid,
    queryFn: () => getSaijDocument(guid as string),
  });

  return {
    document: query.data?.document,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};