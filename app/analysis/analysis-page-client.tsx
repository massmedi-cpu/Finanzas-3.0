"use client";

import { useEffect, useState } from "react";
import type { AnalysisSnapshot, AnalysisTrend } from "../../src/application/analysis/analysis-engine";
import AnalysisClient from "./analysis-client";
import styles from "./analysis.module.css";

function currentMadridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function changeBps(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10000) / Math.abs(previous));
}

function insufficientTrend(sampleMonths: number): AnalysisTrend {
  return {
    direction: "insufficient",
    delta: null,
    recentAverage: null,
    previousAverage: null,
    sampleMonths,
  };
}

function normalizeAnalysisPayload(payload: unknown): AnalysisSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, any>;

  if (source.contractVersion === 2 && source.selection) {
    return source as AnalysisSnapshot;
  }

  if (source.contractVersion !== 1 || !source.current || !source.previous || !source.month) {
    return null;
  }

  const current = source.current as Record<string, any>;
  const previous = source.previous as Record<string, any>;
  const currentSavings = Number(current.savingsCents ?? current.operatingNetCents ?? 0);
  const previousSavings = Number(previous.savingsCents ?? previous.operatingNetCents ?? 0);
  const currentRate = typeof current.savingsRateBps === "number" ? current.savingsRateBps : null;
  const previousRate = typeof previous.savingsRateBps === "number" ? previous.savingsRateBps : null;
  const sampleMonths = 2;

  const categoryDrivers = Array.isArray(source.categoryDrivers)
    ? source.categoryDrivers.map((item: Record<string, any>) => ({
        id: typeof item.id === "string" ? item.id : null,
        name: typeof item.name === "string" ? item.name : "Sin categoría",
        expenseCents: Number(item.expenseCents ?? 0),
        previousExpenseCents: 0,
        deltaCents: Number(item.expenseCents ?? 0),
        changeBps: null,
        shareBps: typeof item.shareBps === "number" ? item.shareBps : null,
        rows: Number(item.rows ?? 0),
        previousRows: 0,
        href: typeof item.href === "string" ? item.href : null,
      }))
    : [];

  const merchantDrivers = Array.isArray(source.merchantDrivers)
    ? source.merchantDrivers.map((item: Record<string, any>) => ({
        id: typeof item.id === "string" ? item.id : null,
        name: typeof item.name === "string" ? item.name : "Sin comercio",
        expenseCents: Number(item.expenseCents ?? 0),
        previousExpenseCents: 0,
        deltaCents: Number(item.expenseCents ?? 0),
        changeBps: null,
        shareBps: typeof item.shareBps === "number" ? item.shareBps : null,
        rows: Number(item.rows ?? 0),
        previousRows: 0,
        href: typeof item.href === "string" ? item.href : null,
        averageCents: null,
        habitualAverageCents: null,
        habitualRows: 0,
        habitualVariationBps: null,
      }))
    : [];

  const currentPeriod = {
    dateFrom: String(current.dateFrom),
    dateTo: String(current.dateTo),
    incomeCents: Number(current.incomeCents ?? 0),
    expenseCents: Number(current.expenseCents ?? 0),
    operatingNetCents: Number(current.operatingNetCents ?? 0),
    savingsCents: currentSavings,
    savingsRateBps: currentRate,
  };
  const previousPeriod = {
    dateFrom: String(previous.dateFrom),
    dateTo: String(previous.dateTo),
    incomeCents: Number(previous.incomeCents ?? 0),
    expenseCents: Number(previous.expenseCents ?? 0),
    operatingNetCents: Number(previous.operatingNetCents ?? 0),
    savingsCents: previousSavings,
    savingsRateBps: previousRate,
  };

  return {
    contractVersion: 2,
    selection: {
      range: "1m",
      month: String(source.month),
      accountId: null,
      dateFrom: currentPeriod.dateFrom,
      dateTo: currentPeriod.dateTo,
      previousDateFrom: previousPeriod.dateFrom,
      previousDateTo: previousPeriod.dateTo,
      partial: false,
      partialMonthStart: null,
    },
    current: currentPeriod,
    previous: previousPeriod,
    comparison: {
      incomeDeltaCents: Number(source.comparison?.incomeDeltaCents ?? currentPeriod.incomeCents - previousPeriod.incomeCents),
      incomeChangeBps: typeof source.comparison?.incomeChangeBps === "number" ? source.comparison.incomeChangeBps : changeBps(currentPeriod.incomeCents, previousPeriod.incomeCents),
      expenseDeltaCents: Number(source.comparison?.expenseDeltaCents ?? currentPeriod.expenseCents - previousPeriod.expenseCents),
      expenseChangeBps: typeof source.comparison?.expenseChangeBps === "number" ? source.comparison.expenseChangeBps : changeBps(currentPeriod.expenseCents, previousPeriod.expenseCents),
      netDeltaCents: Number(source.comparison?.netDeltaCents ?? currentPeriod.operatingNetCents - previousPeriod.operatingNetCents),
      netChangeBps: typeof source.comparison?.netChangeBps === "number" ? source.comparison.netChangeBps : changeBps(currentPeriod.operatingNetCents, previousPeriod.operatingNetCents),
      savingsDeltaCents: currentSavings - previousSavings,
      savingsChangeBps: changeBps(currentSavings, previousSavings),
      savingsRateDeltaBps: currentRate === null || previousRate === null ? null : currentRate - previousRate,
    },
    averages: {
      last3Months: null,
      last6Months: null,
    },
    history: [
      {
        monthStart: `${previousPeriod.dateFrom.slice(0, 7)}-01`,
        rows: 0,
        incomeCents: previousPeriod.incomeCents,
        expenseCents: previousPeriod.expenseCents,
        operatingNetCents: previousPeriod.operatingNetCents,
        savingsCents: previousPeriod.savingsCents,
        savingsRateBps: previousPeriod.savingsRateBps,
      },
      {
        monthStart: `${currentPeriod.dateFrom.slice(0, 7)}-01`,
        rows: Number(source.quality?.expenseRows ?? 0),
        incomeCents: currentPeriod.incomeCents,
        expenseCents: currentPeriod.expenseCents,
        operatingNetCents: currentPeriod.operatingNetCents,
        savingsCents: currentPeriod.savingsCents,
        savingsRateBps: currentPeriod.savingsRateBps,
      },
    ],
    trends: {
      income: insufficientTrend(sampleMonths),
      expense: insufficientTrend(sampleMonths),
      savings: insufficientTrend(sampleMonths),
      net: insufficientTrend(sampleMonths),
      savingsRate: insufficientTrend(sampleMonths),
    },
    categoryDrivers,
    merchantDrivers,
    changeDrivers: categoryDrivers,
    concentration: {
      top3CategoryBps: categoryDrivers.slice(0, 3).reduce((sum: number, item: { shareBps: number | null }) => sum + (item.shareBps ?? 0), 0) || null,
      top3MerchantBps: merchantDrivers.slice(0, 3).reduce((sum: number, item: { shareBps: number | null }) => sum + (item.shareBps ?? 0), 0) || null,
    },
    anomalies: [],
    fixedVariable: {
      available: false,
      reliableRecurrences: 0,
      fixedExpenseCents: 0,
      variableExpenseCents: currentPeriod.expenseCents,
      fixedShareBps: null,
    },
    budget: null,
    forecast: null,
    accounts: [],
    quality: {
      reconciled: source.quality?.reconciled !== false,
      categoryExpenseCents: categoryDrivers.reduce((sum: number, item: { expenseCents: number }) => sum + item.expenseCents, 0),
      expenseRows: Number(source.quality?.expenseRows ?? 0),
      excludedRows: Number(source.quality?.excludedRows ?? 0),
      confirmedDuplicateRows: Number(source.quality?.confirmedDuplicateRows ?? 0),
    },
    principles: {
      bankSource: "read_only",
      totals: "financial_period",
      history: "financial_monthly_series",
      drivers: "financial_transaction_facts_aggregate",
      anomalies: "deterministic_history_threshold",
      generativeAi: false,
    },
  };
}

export default function AnalysisPageClient({ initialSnapshot }: { initialSnapshot: AnalysisSnapshot | null }) {
  const normalizedInitial = normalizeAnalysisPayload(initialSnapshot);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(normalizedInitial);
  const [resolved, setResolved] = useState(Boolean(normalizedInitial));

  useEffect(() => {
    if (normalizedInitial) return;

    const controller = new AbortController();
    const month = currentMadridMonth();
    void fetch(`/api/analysis?month=${encodeURIComponent(month)}&range=1m`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error("analysis_unavailable");
        const normalized = normalizeAnalysisPayload(payload);
        if (!normalized) throw new Error("analysis_contract_unsupported");
        return normalized;
      })
      .then((next) => {
        if (!controller.signal.aborted) setSnapshot(next);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          console.error("analysis-client-recovery", cause instanceof Error ? cause.message : String(cause));
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolved(true);
      });

    return () => controller.abort();
  }, [normalizedInitial]);

  if (!resolved) {
    return (
      <main className={styles.shell} aria-busy="true">
        <h1>Análisis</h1>
        <div role="status" aria-label="Cargando análisis financiero">Preparando el análisis financiero…</div>
      </main>
    );
  }

  return <AnalysisClient key={snapshot ? `analysis-${snapshot.selection.month}-${snapshot.selection.range}` : "analysis-unavailable"} initialSnapshot={snapshot} />;
}
