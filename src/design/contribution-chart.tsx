"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

type ViewMode = "change" | "compare";

export function ContributionChart({ rows, formatMoney, limit = 6 }: Props) {
  const [view, setView] = useState<ViewMode>("change");
  const visible = useMemo(
    () => rows.filter((row) => row.deltaCents !== 0 || row.expenseCents > 0 || row.previousExpenseCents > 0).slice(0, limit),
    [rows, limit],
  );
  const changeMaximum = Math.max(1, ...visible.map((row) => Math.abs(row.deltaCents)));
  const compareMaximum = Math.max(1, ...visible.flatMap((row) => [row.expenseCents, row.previousExpenseCents]));

  if (visible.length === 0) {
    return <p className={styles.empty}>No hay variaciones relevantes entre los periodos comparables.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.viewSwitch} role="group" aria-label="Modo de visualización de cambios">
        <button
          type="button"
          className={view === "change" ? styles.viewActive : styles.viewButton}
          aria-pressed={view === "change"}
          onClick={() => setView("change")}
        >
          Variación
        </button>
        <button
          type="button"
          className={view === "compare" ? styles.viewActive : styles.viewButton}
          aria-pressed={view === "compare"}
          onClick={() => setView("compare")}
        >
          Actual vs anterior
        </button>
      </div>

      <div className={styles.chart} role="list" aria-label={view === "change" ? "Categorías que explican el cambio de gasto" : "Comparación de gasto actual y anterior por categoría"}>
        {visible.map((row) => {
          const increased = row.deltaCents > 0;
          const changeWidth = Math.max(5, Math.round((Math.abs(row.deltaCents) / changeMaximum) * 50));
          const currentWidth = Math.max(2, Math.round((row.expenseCents / compareMaximum) * 100));
          const previousWidth = Math.max(2, Math.round((row.previousExpenseCents / compareMaximum) * 100));
          const accessible = `${row.name}: gasto actual ${formatMoney(row.expenseCents)}; periodo comparable ${formatMoney(row.previousExpenseCents)}; ${increased ? "aumenta" : row.deltaCents < 0 ? "disminuye" : "sin cambio"} ${formatMoney(Math.abs(row.deltaCents))}`;

          return (
            <div key={`${row.id ?? "none"}-${row.name}`} className={styles.row} role="listitem" aria-label={accessible}>
              <div className={styles.label}>
                <strong>{row.name}</strong>
                <span>{row.deltaCents === 0 ? "Sin cambio" : `${increased ? "+" : "−"}${formatMoney(Math.abs(row.deltaCents))}`}</span>
              </div>

              {view === "change" ? (
                <div className={styles.track} aria-hidden="true">
                  <span className={styles.axis} />
                  {row.deltaCents !== 0 && (
                    <span
                      className={increased ? styles.increase : styles.decrease}
                      style={increased ? { width: `${changeWidth}%`, left: "50%" } : { width: `${changeWidth}%`, right: "50%" }}
                    />
                  )}
                </div>
              ) : (
                <div className={styles.compareTrack} aria-hidden="true">
                  <div>
                    <span>Actual</span>
                    <i className={styles.currentBar} style={{ width: `${currentWidth}%` }} />
                  </div>
                  <div>
                    <span>Anterior</span>
                    <i className={styles.previousBar} style={{ width: `${previousWidth}%` }} />
                  </div>
                </div>
              )}

              <div className={styles.meta}>
                <span>{view === "change" ? (row.deltaCents > 0 ? "Más gasto" : row.deltaCents < 0 ? "Menos gasto" : "Sin cambio") : `${formatMoney(row.expenseCents)} · antes ${formatMoney(row.previousExpenseCents)}`}</span>
                {row.href ? <Link href={row.href}>Ver movimientos</Link> : <span>Sin filtro disponible</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
