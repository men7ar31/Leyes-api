import { api } from "./api";
import type { SaijDocumentResponse, SaijSearchRequest, SaijSearchResponse } from "../types/saij";

export const searchSaij = (payload: SaijSearchRequest) =>
  api.post<SaijSearchResponse>("/api/saij/search", payload);

export const getSaijDocument = (guid: string) =>
  api.get<SaijDocumentResponse>(`/api/saij/document/${encodeURIComponent(guid)}`);