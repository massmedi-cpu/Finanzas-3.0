import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isBudgetSnapshot, type BudgetSnapshot } from "./budget-contract";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentBudgetMonthMadrid() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const value = `${year}-${month}`;
  if (!MONTH.test(value)) throw new Error("invalid_budget_month_clock");
  return value;
}

export function resolveBudgetMonth(month?: string | null) {
  const candidate = month?.trim() || currentBudgetMonthMadrid();
  if (!MONTH.test(candidate) || Number(candidate.slice(0, 4)) < 1) {
    throw new Error("invalid_budget_month");
  }
  return candidate;
}

export async function loadBudgetSnapshot(month?: string | null): Promise<BudgetSnapshot> {
  const resolvedMonth = resolveBudgetMonth(month);
  const result = await callPersistenceGateway<BudgetSnapshot>("budget.snapshot", { month: resolvedMonth });
  if (!isBudgetSnapshot(result) || result.month !== resolvedMonth) {
    throw new Error("invalid_budget_snapshot_contract");
  }
  return result;
}
