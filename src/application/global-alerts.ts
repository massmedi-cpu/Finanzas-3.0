import { formatDate, formatInteger as formatAlertCount } from "../core/formatters";

export type GlobalAlertTone = "danger" | "warning" | "info";
export type GlobalAlertCategory = "source" | "forecast" | "budget" | "transaction" | "document" | "analysis";

export type GlobalAlert = {
  id: string;
  category: GlobalAlertCategory;
  priority: number;
  tone: GlobalAlertTone;
  title: string;
  detail: string;
  href: string;
  action: string;
};

type BudgetSignal = {
  categoryName?: string | null;
  progressBps: number | null;
  status: "empty" | "unfunded" | "on_track" | "over";
};

type ForecastSignal = {
  projectedClosingBalanceCents: number;
  plannedItems: number;
  items: Array<{
    date: string;
    concept: string;
    amountCents: number;
    status: "planned" | "excluded" | "confirmed";
    affectsProjection: boolean;
  }>;
};

export type GlobalAlertInput = {
  today: string;
  syncState: "failed" | "warning" | "ok" | "unknown";
  syncDetail?: string | null;
  failedSourceCount?: number;
  quality?: {
    suspectedDuplicateRows: number;
    signMismatchRows: number;
  } | null;
  month?: {
    operatingNetCents: number;
  } | null;
  budgets?: BudgetSignal[] | null;
  forecast?: ForecastSignal | null;
  uncategorizedCount?: number | null;
  unassociatedDocumentCount?: number | null;
  pendingDocumentReviewCount?: number | null;
};

const NEAR_BUDGET_LIMIT_BPS = 9_000;
const BUDGET_LIMIT_BPS = 10_000;
const UPCOMING_PAYMENT_DAYS = 7;

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue;
}

export function deriveGlobalAlerts(input: GlobalAlertInput): GlobalAlert[] {
  const alerts: GlobalAlert[] = [];

  if (input.syncState === "failed") {
    alerts.push({
      id: "sync-failed",
      category: "source",
      priority: 100,
      tone: "danger",
      title: "La última actualización falló",
      detail: "Los datos existentes siguen disponibles, pero conviene revisar la fuente antes de tomar decisiones con información nueva.",
      href: "/configuration/source",
      action: "Revisar fuente",
    });
  } else if (input.syncState === "warning") {
    alerts.push({
      id: "sync-warning",
      category: "source",
      priority: 88,
      tone: "warning",
      title: "La última sincronización tiene avisos",
      detail: input.syncDetail?.trim() || "La lectura terminó, pero hay incidencias que requieren revisión.",
      href: "/configuration/source",
      action: "Revisar fuente",
    });
  }

  const failedSourceCount = Math.max(0, input.failedSourceCount ?? 0);
  if (failedSourceCount > 0) {
    alerts.push({
      id: "partial-dashboard-data",
      category: "source",
      priority: 86,
      tone: "info",
      title: "Parte de la información no está disponible",
      detail: `${formatAlertCount(failedSourceCount)} ${plural(failedSourceCount, "fuente del resumen no respondió", "fuentes del resumen no respondieron")}. El resto permanece operativo.`,
      href: "/configuration",
      action: "Comprobar estado",
    });
  }

  const projectedClosingBalance = input.forecast?.projectedClosingBalanceCents ?? null;
  if ((input.forecast?.plannedItems ?? 0) > 0 && projectedClosingBalance !== null && projectedClosingBalance < 0) {
    alerts.push({
      id: "forecast-negative-balance",
      category: "forecast",
      priority: 96,
      tone: "danger",
      title: "La previsión termina con saldo negativo",
      detail: "Los cobros y pagos planificados llevan el saldo proyectado por debajo de cero dentro del horizonte actual.",
      href: "/forecast",
      action: "Ver previsión",
    });
  }

  const budgetRows = input.budgets ?? [];
  const overBudgetCount = budgetRows.filter((item) => item.status === "over").length;
  if (overBudgetCount > 0) {
    alerts.push({
      id: "budget-over",
      category: "budget",
      priority: 94,
      tone: "danger",
      title: `${formatAlertCount(overBudgetCount)} ${plural(overBudgetCount, "presupuesto superado", "presupuestos superados")}`,
      detail: "Hay categorías cuyo gasto ya supera el límite definido.",
      href: "/budgets",
      action: "Ver presupuestos",
    });
  }

  const nearBudgetCount = budgetRows.filter((item) =>
    item.status === "on_track"
    && item.progressBps !== null
    && item.progressBps >= NEAR_BUDGET_LIMIT_BPS
    && item.progressBps < BUDGET_LIMIT_BPS,
  ).length;
  if (nearBudgetCount > 0) {
    alerts.push({
      id: "budget-near-limit",
      category: "budget",
      priority: 78,
      tone: "warning",
      title: `${formatAlertCount(nearBudgetCount)} ${plural(nearBudgetCount, "presupuesto cerca del límite", "presupuestos cerca del límite")}`,
      detail: "Estas categorías han consumido al menos el 90 % de su presupuesto sin haberlo superado todavía.",
      href: "/budgets",
      action: "Revisar margen",
    });
  }

  const suspectedDuplicateRows = Math.max(0, input.quality?.suspectedDuplicateRows ?? 0);
  if (suspectedDuplicateRows > 0) {
    alerts.push({
      id: "suspected-duplicates",
      category: "transaction",
      priority: 84,
      tone: "warning",
      title: `${formatAlertCount(suspectedDuplicateRows)} ${plural(suspectedDuplicateRows, "posible movimiento duplicado", "posibles movimientos duplicados")}`,
      detail: "Son candidatos a revisión; Financial App no elimina ni altera movimientos bancarios automáticamente.",
      href: "/transactions?duplicateState=suspected",
      action: "Revisar duplicados",
    });
  }

  const signMismatchRows = Math.max(0, input.quality?.signMismatchRows ?? 0);
  if (signMismatchRows > 0) {
    alerts.push({
      id: "sign-mismatch",
      category: "transaction",
      priority: 82,
      tone: "warning",
      title: `${formatAlertCount(signMismatchRows)} ${plural(signMismatchRows, "movimiento con signo incoherente", "movimientos con signo incoherente")}`,
      detail: "El tipo financiero y el signo bancario no coinciden. El importe original no se corrige automáticamente.",
      href: "/transactions?signMismatch=true",
      action: "Revisar movimientos",
    });
  }

  const uncategorizedCount = Math.max(0, input.uncategorizedCount ?? 0);
  if (uncategorizedCount > 0) {
    alerts.push({
      id: "uncategorized-transactions",
      category: "transaction",
      priority: 76,
      tone: "warning",
      title: `${formatAlertCount(uncategorizedCount)} ${plural(uncategorizedCount, "movimiento sin categorizar", "movimientos sin categorizar")}`,
      detail: "Clasificarlos mejora presupuestos, análisis y previsiones sin modificar la fuente bancaria.",
      href: "/transactions?uncategorized=true",
      action: "Categorizar",
    });
  }

  const upcomingCutoff = addDays(input.today, UPCOMING_PAYMENT_DAYS);
  const upcomingPayments = (input.forecast?.items ?? [])
    .filter((item) =>
      item.affectsProjection
      && item.status === "planned"
      && item.amountCents < 0
      && item.date >= input.today
      && item.date <= upcomingCutoff,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcomingPayments.length > 0) {
    const first = upcomingPayments[0];
    alerts.push({
      id: "upcoming-payments",
      category: "forecast",
      priority: 72,
      tone: "info",
      title: `${formatAlertCount(upcomingPayments.length)} ${plural(upcomingPayments.length, "pago previsto en los próximos 7 días", "pagos previstos en los próximos 7 días")}`,
      detail: `El primero está previsto para ${formatDate(first.date)}. Revisa la previsión si ha cambiado la fecha o el importe.`,
      href: "/forecast",
      action: "Ver próximos pagos",
    });
  }

  const unassociatedDocumentCount = Math.max(0, input.unassociatedDocumentCount ?? 0);
  if (unassociatedDocumentCount > 0) {
    alerts.push({
      id: "unassociated-documents",
      category: "document",
      priority: 68,
      tone: "info",
      title: `${formatAlertCount(unassociatedDocumentCount)} ${plural(unassociatedDocumentCount, "documento sin asociar", "documentos sin asociar")}`,
      detail: "Puedes vincularlos manualmente a sus movimientos cuando exista una coincidencia válida.",
      href: "/documents?unassociated=true",
      action: "Revisar documentos",
    });
  }

  const pendingDocumentReviewCount = Math.max(0, input.pendingDocumentReviewCount ?? 0);
  if (pendingDocumentReviewCount > 0) {
    alerts.push({
      id: "pending-document-review",
      category: "document",
      priority: 66,
      tone: "warning",
      title: `${formatAlertCount(pendingDocumentReviewCount)} ${plural(pendingDocumentReviewCount, "documento pendiente de revisar", "documentos pendientes de revisar")}`,
      detail: "La revisión humana sigue siendo obligatoria antes de confirmar datos extraídos o asociaciones.",
      href: "/documents?status=pending_review",
      action: "Abrir revisión",
    });
  }

  if ((input.month?.operatingNetCents ?? 0) < 0) {
    alerts.push({
      id: "negative-month-result",
      category: "analysis",
      priority: 60,
      tone: "warning",
      title: "El resultado del mes está en negativo",
      detail: "Los gastos del periodo superan a los ingresos considerados por el análisis actual.",
      href: "/analysis",
      action: "Abrir análisis",
    });
  }

  return alerts.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function summarizeGlobalAlerts(alerts: GlobalAlert[]) {
  return alerts.reduce(
    (summary, alert) => {
      summary.total += 1;
      summary[alert.tone] += 1;
      return summary;
    },
    { total: 0, danger: 0, warning: 0, info: 0 },
  );
}
