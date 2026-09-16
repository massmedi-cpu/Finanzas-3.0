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
  {
    label: "Todos",
    href: "/transactions",
    matches: (params) => params.size === 0,
  },
  {
    label: "Gastos",
    href: "/transactions?kind=expense",
    matches: (params) => params.get("kind") === "expense" && params.size === 1,
  },
  {
    label: "Ingresos",
    href: "/transactions?kind=income",
    matches: (params) => params.get("kind") === "income" && params.size === 1,
  },
  {
    label: "Transferencias",
    href: "/transactions?kind=transfer",
    matches: (params) => params.get("kind") === "transfer" && params.size === 1,
  },
  {
    label: "Por revisar",
    href: "/transactions?reviewState=needs_review",
    matches: (params) => params.get("reviewState") === "needs_review" && params.size === 1,
  },
  {
    label: "Sin categoría",
    href: "/transactions?categoryId=__uncategorized__",
    matches: (params) => params.get("categoryId") === "__uncategorized__" && params.size === 1,
  },
  {
    label: "Posibles duplicados",
    href: "/transactions?duplicateState=suspected",
    matches: (params) => params.get("duplicateState") === "suspected" && params.size === 1,
  },
];

export default function TransactionsQuickNav() {
  const searchParams = useSearchParams();
  const current = new URLSearchParams(searchParams.toString());

  return (
    <div className={styles.wrap}>
      <nav className={styles.rail} aria-label="Filtros rápidos de movimientos">
        <span className={styles.label}>Ver rápido</span>
        {presets.map((preset) => {
          const active = preset.matches(current);
          return (
            <Link
              key={preset.href}
              href={preset.href}
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
