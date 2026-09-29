export const MIN_GLOBAL_SEARCH_QUERY_LENGTH = 2;
export const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 120;

export type GlobalSearchMove = "next" | "previous";

export function prepareGlobalSearchQuery(value: string) {
  const query = value.trim();
  if (query.length < MIN_GLOBAL_SEARCH_QUERY_LENGTH || query.length > MAX_GLOBAL_SEARCH_QUERY_LENGTH) return null;
  return query;
}

export function moveGlobalSearchIndex(current: number, itemCount: number, direction: GlobalSearchMove) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (direction === "next") {
    return current < 0 || current >= itemCount - 1 ? 0 : current + 1;
  }
  return current <= 0 || current >= itemCount ? itemCount - 1 : current - 1;
}
