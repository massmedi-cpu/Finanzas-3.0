import type { HomeDashboardSource } from "./dashboard-envelope-integrity";

/**
 * Validate only the minimum properties Inicio actually dereferences.
 * Successful HTTP transport does not make an arbitrary JSON object safe
 * to render as account money, chart rows, forecast items or transactions.
 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isHomeDashboardSourceSafe(source: HomeDashboardSource, value: unknown): boolean {
  if (!record(value)) return false;

  if (source === "financial") {
    if (!record(value.period) || !record(value.balances)) return false;
    const period = value.period, balances = value.balances;
    return cents(period.incomeCents) && cents(period.expenseCents)
      && cents(period.operatingNetCents)
      && record(period.quality) && cents(period.quality.signMismatchRows)
      && cents(balances.activeBalanceCents)
      && Array.isArray(balances.accounts) && balances.accounts.every((account: unknown) =>
        record(account) && typeof account.name === "string"
        && (account.lifecycle === "active" || account.lifecycle === "archived")
        && cents(account.balanceCents));
  }

  if (source === "monthly") {
    return Array.isArray(value.rows) && value.rows.every((row: unknown) =>
      record(row) && date(row.monthStart) && row.monthStart.endsWith("-01")
      && cents(row.incomeCents) && cents(row.expenseCents)
      && cents(row.operatingNetCents));
  }

  if (source === "budgets") {
    return typeof value.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
      && record(value.total) && cents(value.total.effectiveAmountCents)
      && cents(value.total.actualExpenseCents)
      && Array.isArray(value.categories) && value.categories.every((category: unknown) =>
        record(category) && cents(category.actualExpenseCents));
  }

  if (source === "forecast") {
    return record(value.summary) && cents(value.summary.plannedItems)
      && value.summary.plannedItems >= 0
      && cents(value.summary.projectedNetCents)
      && cents(value.summary.projectedClosingBalanceCents)
      && Array.isArray(value.items) && value.items.every((item: unknown) =>
        record(item) && typeof item.id === "string" && date(item.date)
        && typeof item.status === "string"
        && typeof item.affectsProjection === "boolean");
  }

  return Array.isArray(value.rows)
    && (value.totalCount === undefined || cents(value.totalCount))
    && value.rows.every((transaction: unknown) =>
      record(transaction) && date(transaction.bankDate)
      && cents(transaction.amountCents)
      && record(transaction.account) && typeof transaction.account.name === "string"
      && record(transaction.concept) && typeof transaction.concept.effective === "string");
}
