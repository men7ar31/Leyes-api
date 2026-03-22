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

  const items = query.data?.pages.flatMap((page) => page.hits) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    items,
    total,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};
