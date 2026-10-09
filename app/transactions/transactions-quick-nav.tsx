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

function contextualHref(preset: Preset, current: URLSearchParams) {
  if (preset.label === "Todos") return "/transactions";
  const target = new URLSearchParams(current);
  const override = new URLSearchParams(preset.href.split("?")[1] ?? "");
  for (const [key, value] of override) {
    if (key === "categoryId") target.delete("uncategorized");
    target.set(key, value);
  }
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
          const active = preset.matches(current);
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
