import { api } from "./api";

export type ProvincialCodeDocumentRequest = {
  province: string;
  area: string;
  reference: string;
  numeroNorma?: string;
};

export type ProvincialCodeDocumentResponse = {
  ok: boolean;
  document: {
    title: string;
    sourceUrl: string;
    contentText: string;
    fetchedAt: string;
  };
};

export const fetchProvincialCodeDocument = (payload: ProvincialCodeDocumentRequest) =>
  api.post<ProvincialCodeDocumentResponse>("/api/provincial-codes/document", payload, { timeoutMs: 45000 });
