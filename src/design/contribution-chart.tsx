"use client";

import Link from "next/link";
import { useMemo } from "react";
import styles from "./contribution-chart.module.css";

export type ContributionPoint = {
  id: string | null;
  name: string;
  deltaCents: number;
  expenseCents: number;
  previousExpenseCents: number;
  href: string | null;
};

type Props = {
  rows: ContributionPoint[];
  formatMoney: (cents: number) => string;
  limit?: number;
};

export function ContributionChart({ rows, formatMoney, limit = 6 }: Props) {
  const visible = useMemo(
    () => rows.filter((row) => row.deltaCents !== 0).slice(0, limit),
    [rows, limit],
  );
  const maximum = Math.max(1, ...visible.map((row) => Math.abs(row.deltaCents)));

  if (visible.length === 0) {
    return <p className={styles.empty}>No hay variaciones relevantes entre los periodos comparables.</p>;
  }

  return (
    <div className={styles.chart} role="list" aria-label="Categorías que explican el cambio de gasto">
      {visible.map((row) => {
        const increased = row.deltaCents > 0;
        const width = Math.max(5, Math.round((Math.abs(row.deltaCents) / maximum) * 50));
        const accessible = `${row.name}: ${increased ? "aumenta" : "disminuye"} ${formatMoney(Math.abs(row.deltaCents))}; gasto actual ${formatMoney(row.expenseCents)}; periodo comparable ${formatMoney(row.previousExpenseCents)}`;
        return (
          <div key={`${row.id ?? "none"}-${row.name}`} className={styles.row} role="listitem" aria-label={accessible}>
            <div className={styles.label}>
              <strong>{row.name}</strong>
              <span>{increased ? "+" : "−"}{formatMoney(Math.abs(row.deltaCents))}</span>
            </div>
            <div className={styles.track} aria-hidden="true">
              <span className={styles.axis} />
              <span
                className={increased ? styles.increase : styles.decrease}
                style={increased ? { width: `${width}%`, left: "50%" } : { width: `${width}%`, right: "50%" }}
              />
            </div>
            <div className={styles.meta}>
              <span>{increased ? "Más gasto" : "Menos gasto"}</span>
              {row.href ? <Link href={row.href}>Ver movimientos</Link> : <span>Sin filtro disponible</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
