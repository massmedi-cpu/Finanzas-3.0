"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { categoryColorHex } from "../src/domain/category-visuals";
import { CategoryGlyph } from "../src/ui/category-glyph";
import styles from "./category-identity.module.css";

type CategoryVisual = {
  id: string;
  name: string;
  iconKey: string;
  colorToken: string;
};

type CategoryIdentityState = {
  byId: ReadonlyMap<string, CategoryVisual> | null;
};

const CategoryIdentityContext = createContext<CategoryIdentityState>({ byId: null });

function normalizeCategory(value: unknown): CategoryVisual | null {
  if (!value || typeof value !== "object") return null;
  const category = value as Record<string, unknown>;
  if (
    typeof category.id !== "string"
    || typeof category.name !== "string"
    || typeof category.iconKey !== "string"
    || typeof category.colorToken !== "string"
  ) return null;
  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    colorToken: category.colorToken,
  };
}

export function CategoryIdentityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [categories, setCategories] = useState<CategoryVisual[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCategories(null);
    void fetch("/api/category-identity", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("category_identity_unavailable");
        const payload = await response.json().catch(() => ({}));
        if (!Array.isArray(payload?.categories)) throw new Error("category_identity_invalid");
        return payload.categories.map(normalizeCategory).filter(Boolean) as CategoryVisual[];
      })
      .then((next) => {
        if (!cancelled) setCategories(next);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  const byId = useMemo(() => {
    if (categories === null) return null;
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  return <CategoryIdentityContext.Provider value={{ byId }}>{children}</CategoryIdentityContext.Provider>;
}

export function CategoryIdentity({
  categoryId,
  name,
  fallback = "Sin categoría",
  iconOnly = false,
}: {
  categoryId: string | null | undefined;
  name?: string | null;
  fallback?: string;
  iconOnly?: boolean;
}) {
  const { byId } = useContext(CategoryIdentityContext);
  const visual = categoryId && byId ? byId.get(categoryId) ?? null : null;
  const label = name?.trim() || visual?.name || fallback;

  if (!categoryId || !visual) {
    if (iconOnly) return <span className={styles.iconPlaceholder} aria-hidden="true" />;
    return <span className={styles.labelOnly}>{label}</span>;
  }

  const style = { "--category-color": categoryColorHex(visual.colorToken) } as CSSProperties;
  if (iconOnly) {
    return (
      <span
        className={styles.iconOnly}
        style={style}
        aria-hidden="true"
        data-category-id={categoryId}
        data-category-icon={visual.iconKey}
        data-category-color-token={visual.colorToken}
      >
        <CategoryGlyph name={visual.iconKey} size={17} />
      </span>
    );
  }

  return (
    <span
      className={styles.identity}
      style={style}
      data-category-id={categoryId}
      data-category-icon={visual.iconKey}
      data-category-color-token={visual.colorToken}
    >
      <span className={styles.icon} aria-hidden="true"><CategoryGlyph name={visual.iconKey} size={15} /></span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
