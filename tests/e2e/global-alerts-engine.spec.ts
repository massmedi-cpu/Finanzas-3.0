import { expect, test } from "@playwright/test";
import { deriveGlobalAlerts, summarizeGlobalAlerts } from "../../src/application/global-alerts";

const base = {
  today: "2026-09-30",
  syncState: "ok" as const,
  failedSourceCount: 0,
  quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  month: { operatingNetCents: 100_00 },
  budgets: [],
  forecast: {
    projectedClosingBalanceCents: 100_00,
    plannedItems: 0,
    items: [],
  },
  uncategorizedCount: 0,
  unassociatedDocumentCount: 0,
  pendingDocumentReviewCount: 0,
};

test("Axioma · el motor agrupa señales accionables sin escribir ni corregir datos", () => {
  const alerts = deriveGlobalAlerts({
    ...base,
    syncState: "warning",
    syncDetail: "1 aviso adicional requiere revisión.",
    quality: { suspectedDuplicateRows: 2, signMismatchRows: 1 },
    month: { operatingNetCents: -50_00 },
    budgets: [
      { categoryName: "Ocio", progressBps: 10_500, status: "over" },
      { categoryName: "Compras", progressBps: 9_350, status: "on_track" },
      { categoryName: "Casa", progressBps: 4_000, status: "on_track" },
    ],
    forecast: {
      projectedClosingBalanceCents: -25_00,
      plannedItems: 2,
      items: [
        { date: "2026-10-02", concept: "Recibo", amountCents: -40_00, status: "planned", affectsProjection: true },
        { date: "2026-10-20", concept: "Cuota", amountCents: -30_00, status: "planned", affectsProjection: true },
      ],
    },
    uncategorizedCount: 3,
    unassociatedDocumentCount: 4,
    pendingDocumentReviewCount: 2,
  });

  const ids = alerts.map((alert) => alert.id);
  expect(ids).toEqual(expect.arrayContaining([
    "sync-warning",
    "forecast-negative-balance",
    "budget-over",
    "budget-near-limit",
    "suspected-duplicates",
    "sign-mismatch",
    "uncategorized-transactions",
    "upcoming-payments",
    "unassociated-documents",
    "pending-document-review",
    "negative-month-result",
  ]));
  expect(alerts[0]?.id).toBe("forecast-negative-balance");
  expect(alerts.filter((alert) => alert.id === "budget-near-limit")).toHaveLength(1);
  expect(alerts.find((alert) => alert.id === "suspected-duplicates")?.href).toBe("/transactions?duplicateState=suspected");
  expect(alerts.find((alert) => alert.id === "uncategorized-transactions")?.detail).toContain("sin modificar la fuente bancaria");
});

test("Axioma · presupuesto próximo al límite excluye categorías ya superadas y señales inferiores al 90 %", () => {
  const alerts = deriveGlobalAlerts({
    ...base,
    budgets: [
      { categoryName: "A", progressBps: 8_999, status: "on_track" },
      { categoryName: "B", progressBps: 9_000, status: "on_track" },
      { categoryName: "C", progressBps: 10_000, status: "over" },
    ],
  });

  expect(alerts.find((alert) => alert.id === "budget-near-limit")?.title).toBe("1 presupuesto cerca del límite");
  expect(alerts.find((alert) => alert.id === "budget-over")?.title).toBe("1 presupuesto superado");
});

test("Axioma · pago próximo usa una ventana inclusiva de siete días y no incluye excluidos ni ingresos", () => {
  const alerts = deriveGlobalAlerts({
    ...base,
    forecast: {
      projectedClosingBalanceCents: 100_00,
      plannedItems: 5,
      items: [
        { date: "2026-09-30", concept: "Hoy", amountCents: -10_00, status: "planned", affectsProjection: true },
        { date: "2026-10-07", concept: "Límite", amountCents: -10_00, status: "planned", affectsProjection: true },
        { date: "2026-10-08", concept: "Fuera", amountCents: -10_00, status: "planned", affectsProjection: true },
        { date: "2026-10-01", concept: "Ingreso", amountCents: 10_00, status: "planned", affectsProjection: true },
        { date: "2026-10-01", concept: "Excluido", amountCents: -10_00, status: "excluded", affectsProjection: false },
      ],
    },
  });

  expect(alerts.find((alert) => alert.id === "upcoming-payments")?.title).toBe("2 pagos previstos en los próximos 7 días");
});

test("Axioma · sin señales no genera ruido y el resumen queda a cero", () => {
  const alerts = deriveGlobalAlerts(base);
  expect(alerts).toEqual([]);
  expect(summarizeGlobalAlerts(alerts)).toEqual({ total: 0, danger: 0, warning: 0, info: 0 });
});
