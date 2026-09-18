"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NumberExplanation from "./number-explanation";
import styles from "./home-smart-brief.module.css";

type BudgetStatus = "empty" | "unfunded" | "on_track" | "over";
type SyncState = "success" | "failed" | "pending";

type Props = {
  month: string;
  loading: boolean;
  transactionTotalCount: number | null;
  latestTransactionId: string | null;
  latestTransactionDate: string | null;
  incomeCents: number | null;
  expenseCents: number | null;
  operatingNetCents: number | null;
  activeBalanceCents: number | null;
  budgetProgressBps: number | null;
  budgetStatus: BudgetStatus | null;
  overBudgetCount: number | null;
  projectedNetCents: number | null;
  projectedClosingBalanceCents: number | null;
  plannedItems: number | null;
  syncState: SyncState;
  displayMoney: (cents: number) => string;
};

type HomeVisitSnapshot = {
  version: 1;
  savedAt: string;
  month: string;
  transactionTotalCount: number | null;
  latestTransactionId: string | null;
  latestTransactionDate: string | null;
  expenseCents: number | null;
  operatingNetCents: number | null;
  activeBalanceCents: number | null;
  budgetProgressBps: number | null;
  budgetStatus: BudgetStatus | null;
  projectedNetCents: number | null;
  plannedItems: number | null;
};

type BriefItem = {
  label: string;
  title: string;
  detail: string;
  href: string;
  tone: "neutral" | "positive" | "warning" | "danger";
};

type ChangeItem = {
  title: string;
  detail: string;
  href: string;
  tone: "neutral" | "positive" | "warning";
};

export const HOME_VISIT_KEY = "financial-app:home-last-visit:v1";

const percent = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const dateTime = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});
const dateOnly = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isBudgetStatus(value: unknown): value is BudgetStatus | null {
  return value === null || value === "empty" || value === "unfunded" || value === "on_track" || value === "over";
}

function readVisitSnapshot(raw: string | null): HomeVisitSnapshot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (row.version !== 1 || typeof row.savedAt !== "string" || typeof row.month !== "string") return null;
    if (!nullableFiniteNumber(row.transactionTotalCount)) return null;
    if (!nullableString(row.latestTransactionId) || !nullableString(row.latestTransactionDate)) return null;
    if (!nullableFiniteNumber(row.expenseCents) || !nullableFiniteNumber(row.operatingNetCents)) return null;
    if (!nullableFiniteNumber(row.activeBalanceCents) || !nullableFiniteNumber(row.budgetProgressBps)) return null;
    if (!isBudgetStatus(row.budgetStatus)) return null;
    if (!nullableFiniteNumber(row.projectedNetCents) || !nullableFiniteNumber(row.plannedItems)) return null;
    return row as HomeVisitSnapshot;
  } catch {
    return null;
  }
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "visita anterior";
  return dateTime.format(parsed).replace(".", "");
}

function formatBankDate(value: string | null) {
  if (!value) return "fecha pendiente";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "fecha pendiente";
  return dateOnly.format(parsed).replace(".", "");
}

function signedMoney(delta: number, displayMoney: (cents: number) => string) {
  if (delta === 0) return displayMoney(0);
  return `${delta > 0 ? "+" : "−"}${displayMoney(Math.abs(delta))}`;
}

function signedPoints(deltaBps: number) {
  if (deltaBps === 0) return "0 pp";
  return `${deltaBps > 0 ? "+" : "−"}${percent.format(Math.abs(deltaBps) / 100)} pp`;
}

export default function HomeSmartBrief({
  month,
  loading,
  transactionTotalCount,
  latestTransactionId,
  latestTransactionDate,
  incomeCents,
  expenseCents,
  operatingNetCents,
  activeBalanceCents,
  budgetProgressBps,
  budgetStatus,
  overBudgetCount,
  projectedNetCents,
  projectedClosingBalanceCents,
  plannedItems,
  syncState,
  displayMoney,
}: Props) {
  const [previousVisit, setPreviousVisit] = useState<HomeVisitSnapshot | null | undefined>(undefined);

  useEffect(() => {
    try {
      setPreviousVisit(readVisitSnapshot(localStorage.getItem(HOME_VISIT_KEY)));
    } catch {
      setPreviousVisit(null);
    }
  }, []);

  const currentVisit = useMemo<HomeVisitSnapshot | null>(() => {
    const hasUsefulData = transactionTotalCount !== null
      || expenseCents !== null
      || activeBalanceCents !== null
      || budgetProgressBps !== null
      || projectedNetCents !== null;
    if (!hasUsefulData) return null;
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      month,
      transactionTotalCount,
      latestTransactionId,
      latestTransactionDate,
      expenseCents,
      operatingNetCents,
      activeBalanceCents,
      budgetProgressBps,
      budgetStatus,
      projectedNetCents,
      plannedItems,
    };
  }, [
    activeBalanceCents,
    budgetProgressBps,
    budgetStatus,
    expenseCents,
    latestTransactionDate,
    latestTransactionId,
    month,
    operatingNetCents,
    plannedItems,
    projectedNetCents,
    transactionTotalCount,
  ]);

  useEffect(() => {
    if (loading || previousVisit === undefined || !currentVisit) return;
    try {
      localStorage.setItem(HOME_VISIT_KEY, JSON.stringify(currentVisit));
    } catch {
      // La memoria de visita es auxiliar: nunca bloquea Inicio.
    }
  }, [currentVisit, loading, previousVisit]);

  const currentItems = useMemo<BriefItem[]>(() => {
    const items: BriefItem[] = [];

    if (operatingNetCents !== null && expenseCents !== null) {
      const negative = operatingNetCents < 0;
      const positive = operatingNetCents > 0;
      items.push({
        label: "MES",
        title: negative ? "Balance mensual en negativo" : positive ? "Balance mensual en positivo" : "Mes en equilibrio",
        detail: `Neto ${displayMoney(operatingNetCents)} · gastos ${displayMoney(expenseCents)}${incomeCents !== null ? ` · ingresos ${displayMoney(incomeCents)}` : ""}.`,
        href: "/analysis",
        tone: negative ? "warning" : positive ? "positive" : "neutral",
      });
    }

    if (budgetStatus !== null) {
      const progress = budgetProgressBps !== null ? `${percent.format(budgetProgressBps / 100)} % usado` : null;
      const title = budgetStatus === "over"
        ? "Presupuesto excedido"
        : budgetStatus === "unfunded"
          ? "Gasto sin límite configurado"
          : budgetStatus === "empty"
            ? "Presupuesto sin actividad"
            : "Presupuesto dentro del límite";
      const detail = overBudgetCount && overBudgetCount > 0
        ? `${overBudgetCount} ${overBudgetCount === 1 ? "categoría supera" : "categorías superan"} su límite${progress ? ` · ${progress}` : ""}.`
        : progress ? `${progress}.` : "Sin porcentaje comparable todavía.";
      items.push({
        label: "PRESUPUESTO",
        title,
        detail,
        href: "/budgets",
        tone: budgetStatus === "over" || budgetStatus === "unfunded" ? "danger" : "positive",
      });
    }

    if (plannedItems !== null && projectedNetCents !== null) {
      const hasPlanned = plannedItems > 0;
      const negative = projectedClosingBalanceCents !== null && projectedClosingBalanceCents < 0;
      items.push({
        label: "PRÓXIMOS 30 DÍAS",
        title: hasPlanned
          ? `${plannedItems} ${plannedItems === 1 ? "movimiento previsto" : "movimientos previstos"}`
          : "Sin movimientos previstos",
        detail: `${hasPlanned ? `Neto previsto ${displayMoney(projectedNetCents)}` : "No hay cargos o ingresos planificados"}${projectedClosingBalanceCents !== null ? ` · cierre ${displayMoney(projectedClosingBalanceCents)}` : ""}.`,
        href: "/forecast",
        tone: negative ? "danger" : "neutral",
      });
    }

    const dataTitle = syncState === "failed"
      ? "Actualización pendiente"
      : latestTransactionDate
        ? `Datos hasta ${formatBankDate(latestTransactionDate)}`
        : "Datos disponibles";
    items.push({
      label: "DATOS",
      title: dataTitle,
      detail: transactionTotalCount !== null
        ? `${transactionTotalCount.toLocaleString("es-ES")} movimientos en el historial.`
        : "El historial sigue disponible aunque alguna fuente tarde en responder.",
      href: syncState === "failed" ? "/configuration/source" : "/transactions",
      tone: syncState === "failed" ? "warning" : "neutral",
    });

    return items.slice(0, 4);
  }, [
    budgetProgressBps,
    budgetStatus,
    displayMoney,
    expenseCents,
    incomeCents,
    latestTransactionDate,
    operatingNetCents,
    overBudgetCount,
    plannedItems,
    projectedClosingBalanceCents,
    projectedNetCents,
    syncState,
    transactionTotalCount,
  ]);

  const changes = useMemo<ChangeItem[]>(() => {
    if (!previousVisit || !currentVisit) return [];
    const items: ChangeItem[] = [];
    const sameMonth = previousVisit.month === currentVisit.month;

    if (previousVisit.transactionTotalCount !== null && currentVisit.transactionTotalCount !== null) {
      const delta = currentVisit.transactionTotalCount - previousVisit.transactionTotalCount;
      if (delta > 0) {
        items.push({
          title: `${delta.toLocaleString("es-ES")} ${delta === 1 ? "movimiento nuevo" : "movimientos nuevos"}`,
          detail: `Actividad incorporada desde ${formatDateTime(previousVisit.savedAt)}.`,
          href: "/transactions",
          tone: "neutral",
        });
      } else if (delta === 0 && previousVisit.latestTransactionId && currentVisit.latestTransactionId && previousVisit.latestTransactionId !== currentVisit.latestTransactionId) {
        items.push({
          title: "Actividad actualizada",
          detail: "El último movimiento ha cambiado aunque el total del historial se mantenga.",
          href: "/transactions",
          tone: "neutral",
        });
      }
    }

    if (sameMonth && previousVisit.expenseCents !== null && currentVisit.expenseCents !== null) {
      const delta = currentVisit.expenseCents - previousVisit.expenseCents;
      if (delta !== 0) {
        items.push({
          title: `Gasto del mes ${signedMoney(delta, displayMoney)}`,
          detail: delta > 0 ? "El gasto acumulado ha aumentado desde tu última visita." : "El gasto acumulado ha bajado tras cambios o correcciones.",
          href: "/analysis",
          tone: delta > 0 ? "warning" : "positive",
        });
      }
    }

    if (sameMonth && previousVisit.budgetProgressBps !== null && currentVisit.budgetProgressBps !== null) {
      const delta = currentVisit.budgetProgressBps - previousVisit.budgetProgressBps;
      if (delta !== 0) {
        items.push({
          title: `Presupuesto ${signedPoints(delta)}`,
          detail: currentVisit.budgetStatus === "over" ? "Ahora hay un límite excedido." : "Cambio en el porcentaje de presupuesto consumido.",
          href: "/budgets",
          tone: delta > 0 ? "warning" : "positive",
        });
      }
    }

    if (previousVisit.projectedNetCents !== null && currentVisit.projectedNetCents !== null) {
      const delta = currentVisit.projectedNetCents - previousVisit.projectedNetCents;
      if (delta !== 0) {
        items.push({
          title: `Previsión neta ${signedMoney(delta, displayMoney)}`,
          detail: delta > 0 ? "La previsión ha mejorado desde la última visita." : "La previsión ha bajado desde la última visita.",
          href: "/forecast",
          tone: delta >= 0 ? "positive" : "warning",
        });
      }
    }

    if (sameMonth && previousVisit.activeBalanceCents !== null && currentVisit.activeBalanceCents !== null) {
      const delta = currentVisit.activeBalanceCents - previousVisit.activeBalanceCents;
      if (delta !== 0) {
        items.push({
          title: `Disponible ${signedMoney(delta, displayMoney)}`,
          detail: "Variación del saldo agregado de las cuentas activas.",
          href: "/accounts",
          tone: delta >= 0 ? "positive" : "warning",
        });
      }
    }

    return items.slice(0, 4);
  }, [currentVisit, displayMoney, previousVisit]);

  const monthStart = `${month}-01`;
  const canDrillIntoCurrentMonth = Boolean(latestTransactionDate?.startsWith(month));

  return (
    <section className={styles.shell} aria-label="Resumen inteligente">
      <div className={styles.heading}>
        <div>
          <span>LECTURA RÁPIDA</span>
          <h2>Ahora mismo</h2>
        </div>
        <small>{previousVisit ? `Comparado con ${formatDateTime(previousVisit.savedAt)}` : "Resumen sin datos sensibles guardados"}</small>
      </div>

      <div className={styles.currentGrid}>
        {currentItems.map((item) => (
          <Link prefetch={false} key={`${item.label}-${item.href}`} href={item.href} className={`${styles.currentItem} ${styles[item.tone]}`}>
            <span>{item.label}</span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </Link>
        ))}
      </div>

      <NumberExplanation
        rows={[
          { label: "Disponible", text: "Saldo agregado de las cuentas activas. El detalle y la procedencia de cada saldo se conservan en Cuentas." },
          { label: "Este mes", text: "Ingresos, gastos y neto proceden del resumen financiero canónico del mes. Inicio no recalcula esas cifras." },
          { label: "Presupuesto", text: "Estado y porcentaje proceden del motor central de presupuestos para el mes seleccionado." },
          { label: "Previsión", text: "Neto y cierre de los próximos 30 días proceden del motor de previsión y de las partidas que afectan a la proyección." },
        ]}
        links={[
          { href: "/accounts", label: "Ver cuentas" },
          ...(canDrillIntoCurrentMonth && latestTransactionDate ? [
            { href: `/transactions?dateFrom=${monthStart}&dateTo=${latestTransactionDate}&kind=income`, label: "Ver ingresos del mes" },
            { href: `/transactions?dateFrom=${monthStart}&dateTo=${latestTransactionDate}&kind=expense`, label: "Ver gastos del mes" },
          ] : [{ href: "/analysis", label: "Abrir análisis" }]),
          { href: "/budgets", label: "Ver presupuestos" },
          { href: "/forecast", label: "Ver previsión" },
        ]}
      />

      <div className={styles.visitBlock} aria-live="polite">
        <div className={styles.visitHeading}>
          <div>
            <span>DESDE TU ÚLTIMA VISITA</span>
            <strong>{previousVisit ? "Qué ha cambiado" : previousVisit === null ? "Primera referencia guardada" : "Preparando comparación…"}</strong>
          </div>
          {previousVisit?.savedAt && <small>{formatDateTime(previousVisit.savedAt)}</small>}
        </div>

        {previousVisit === undefined ? (
          <p className={styles.noChanges}>Comparando con la última referencia guardada en este dispositivo…</p>
        ) : previousVisit === null ? (
          <p className={styles.noChanges}>A partir de la próxima visita te mostraré aquí sólo los cambios relevantes, sin guardar nombres de comercios ni conceptos bancarios.</p>
        ) : changes.length > 0 ? (
          <div className={styles.changeGrid}>
            {changes.map((item) => (
              <Link prefetch={false} key={`${item.title}-${item.href}`} href={item.href} className={`${styles.changeItem} ${styles[item.tone]}`}>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.noChanges}>No hay cambios relevantes en los indicadores principales desde tu última visita.</p>
        )}
      </div>
    </section>
  );
}
