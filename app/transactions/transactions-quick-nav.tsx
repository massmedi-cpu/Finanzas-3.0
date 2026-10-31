"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./transactions-quick-nav.module.css";

type Preset = {
  label: string;
  href: string;
  matches: (params: URLSearchParams) => boolean;
};

const presets: Preset[] = [
  { label: "Todos", href: "/transactions", matches: (params) => params.size === 0 },
  { label: "Gastos", href: "/transactions?kind=expense", matches: (params) => params.get("kind") === "expense" },
  { label: "Ingresos", href: "/transactions?kind=income", matches: (params) => params.get("kind") === "income" },
  { label: "Transferencias", href: "/transactions?kind=transfer", matches: (params) => params.get("kind") === "transfer" },
  { label: "Sin categoría", href: "/transactions?categoryId=__uncategorized__", matches: (params) => (params.get("categoryId") === "__uncategorized__" || params.get("uncategorized") === "true") },
  { label: "Posibles duplicados", href: "/transactions?duplicateState=suspected", matches: (params) => params.get("duplicateState") === "suspected" },
];

// A quick preset replaces its own selection scope while retaining searches,
// banking accounts, merchants and dates selected by the owner.
const PRESET_FILTER_KEYS = ["kind", "categoryId", "uncategorized", "duplicateState"] as const;

function isPresetActive(preset: Preset, current: URLSearchParams) {
  if (!preset.matches(current)) return false;
  if (preset.label === "Todos") return true;
  const expected = new URLSearchParams(preset.href.split("?")[1] ?? "");
  return PRESET_FILTER_KEYS.every((key) => {
    const value = current.get(key);
    if (value === null) return true;
    // An old deep-link alias for no category is legitimate for this preset.
    if (preset.label === "Sin categoría" && key === "uncategorized") return value === "true";
    return expected.get(key) === value;
  });
}

function contextualHref(preset: Preset, current: URLSearchParams) {
  if (preset.label === "Todos") return "/transactions";
  const target = new URLSearchParams(current);
  for (const key of PRESET_FILTER_KEYS) target.delete(key);
  const override = new URLSearchParams(preset.href.split("?")[1] ?? "");
  for (const [key, value] of override) target.set(key, value);
  return "/transactions?" + target.toString();
}

export default function TransactionsQuickNav() {
  const searchParams = useSearchParams();
  const current = new URLSearchParams(searchParams.toString());

  return (
    <div className={styles.wrap}>
      <nav className={styles.rail} aria-label="Filtros rápidos de movimientos">
        <span className={styles.label}>Ver rápido</span>
        {presets.map((preset) => {
          const active = isPresetActive(preset, current);
          const destination = contextualHref(preset, current);
          return (
            <Link
              prefetch={false}
              key={preset.href}
              href={destination}
              className={`${styles.pill}${active ? ` ${styles.active}` : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
