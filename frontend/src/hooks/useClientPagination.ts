import { useState, useEffect, useCallback } from "react";

const DEFAULT_PAGE_SIZE = 20;

interface UseClientPaginationOptions {
  total: number;
  pageSize?: number;
  resetKey?: unknown;
}

export function useClientPagination({
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
}: UseClientPaginationOptions) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const slice = useCallback(
    <T>(items: T[]): T[] => {
      const start = (page - 1) * pageSize;
      return items.slice(start, start + pageSize);
    },
    [page, pageSize],
  );

  return { page, pageSize, setPage, totalPages, slice };
}
