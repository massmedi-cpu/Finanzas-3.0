export const MOBILE_FAVORITE_KEY = "financial-app:mobile-favorite";

export const MOBILE_FAVORITE_OPTIONS = [
  "/review",
  "/cash-flow",
  "/accounts",
  "/budgets",
  "/recurrences",
  "/forecast",
  "/documents",
] as const;

export type MobileFavoriteHref = (typeof MOBILE_FAVORITE_OPTIONS)[number];

export function isMobileFavoriteHref(value: unknown): value is MobileFavoriteHref {
  return typeof value === "string" && (MOBILE_FAVORITE_OPTIONS as readonly string[]).includes(value);
}

export function readMobileFavorite(storage: Pick<Storage, "getItem">): MobileFavoriteHref {
  const value = storage.getItem(MOBILE_FAVORITE_KEY);
  return isMobileFavoriteHref(value) ? value : "/review";
}

export function writeMobileFavorite(storage: Pick<Storage, "setItem">, href: MobileFavoriteHref) {
  storage.setItem(MOBILE_FAVORITE_KEY, href);
}
