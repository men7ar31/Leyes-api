import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchSaij } from "../services/saijApi";
import type { SaijSearchFilters, SaijSearchRequest, SaijSearchResponse } from "../types/saij";

type UseSaijSearchParams = {
  contentType: SaijSearchRequest["contentType"];
  filters: SaijSearchFilters;
  pageSize?: number;
  enabled?: boolean;
};

export const useSaijSearch = ({
  contentType,
  filters,
  pageSize = 20,
  enabled = true,
}: UseSaijSearchParams) => {
  const query = useInfiniteQuery<SaijSearchResponse>({
    queryKey: ["saij-search", contentType, filters, pageSize],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) =>
      searchSaij({
        contentType,
        filters,
        offset: pageParam as number,
        pageSize,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.hits.length, 0);
      if (loaded >= lastPage.total) return undefined;
      return lastPage.query.offset + lastPage.query.pageSize;
    },
  });

  const itemsRaw = query.data?.pages.flatMap((page) => page.hits) ?? [];
  const items = useMemo(() => {
    const deduped: typeof itemsRaw = [];
    const seen = new Set<string>();
    for (const item of itemsRaw) {
      const guid = String(item?.guid || "").trim();
      const key = guid || `${item.contentType}::${item.title}::${item.fecha || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    if (contentType !== "sumario" && contentType !== "doctrina" && contentType !== "dictamen") return deduped;
    return [...deduped].sort((a, b) => {
      const ta = a.fecha ? Date.parse(a.fecha) : Number.NEGATIVE_INFINITY;
      const tb = b.fecha ? Date.parse(b.fecha) : Number.NEGATIVE_INFINITY;
      return (Number.isNaN(tb) ? Number.NEGATIVE_INFINITY : tb) - (Number.isNaN(ta) ? Number.NEGATIVE_INFINITY : ta);
    });
  }, [contentType, itemsRaw]);

  const total = query.data?.pages[0]?.total ?? 0;
  const facets = query.data?.pages[0]?.facets ?? [];

  return {
    items,
    total,
    facets,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};
