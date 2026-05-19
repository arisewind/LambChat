export interface CreatePagedGroupsOptions<T, K extends string> {
  page: number;
  pageSize: number;
  getGroupKey: (item: T) => K;
  sortItems?: (a: T, b: T) => number;
}

export interface PagedGroupsResult<T, K extends string> {
  fullGroups: Record<K, T[]>;
  pagedGroups: Record<K, T[]>;
  orderedItems: T[];
  totalPages: number;
}

export function createPagedGroups<T, K extends string>(
  items: T[],
  { page, pageSize, getGroupKey, sortItems }: CreatePagedGroupsOptions<T, K>,
): PagedGroupsResult<T, K> {
  const fullGroups = {} as Record<K, T[]>;
  const groupOrder: K[] = [];

  for (const item of items) {
    const key = getGroupKey(item);
    if (!fullGroups[key]) {
      fullGroups[key] = [];
      groupOrder.push(key);
    }
    fullGroups[key].push(item);
  }

  if (sortItems) {
    for (const key of groupOrder) {
      fullGroups[key] = [...fullGroups[key]].sort(sortItems);
    }
  }

  const orderedItems = groupOrder.flatMap((key) => fullGroups[key]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = orderedItems.slice(start, start + pageSize);
  const pagedGroups = {} as Record<K, T[]>;

  for (const item of pageItems) {
    const key = getGroupKey(item);
    if (!pagedGroups[key]) {
      pagedGroups[key] = [];
    }
    pagedGroups[key].push(item);
  }

  return { fullGroups, pagedGroups, orderedItems, totalPages };
}
