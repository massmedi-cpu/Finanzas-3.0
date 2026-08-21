import { createClient } from "@/lib/supabase/server";

export type BudgetItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  assigned: number;
  spent: number;
  carryover: boolean;
  carryIn: number;
  available: number;
  percent: number;
  suggestion: number;
  movements: number;
  notes: string | null;
};

export type UnbudgetedItem = {
  category: string;
  subcategory: string | null;
  spent: number;
  suggestion: number;
  movements: number;
};

export type BudgetMonth = {
  version: string;
  month: string;
  assigned: number;
  spent: number;
  available: number;
  overBudgetCount: number;
  unbudgetedSpent: number;
  budgets: BudgetItem[];
  unbudgeted: UnbudgetedItem[];
  categories: string[];
};

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function normalizeBudget(raw: any): BudgetItem {
  return {
    id: String(raw.id),
    name: String(raw.name || raw.category || "Presupuesto"),
    category: String(raw.category || "Sin categoría"),
    subcategory: raw.subcategory || null,
    assigned: asNumber(raw.assigned),
    spent: asNumber(raw.spent),
    carryover: Boolean(raw.carryover),
    carryIn: asNumber(raw.carryIn),
    available: asNumber(raw.available),
    percent: asNumber(raw.percent),
    suggestion: asNumber(raw.suggestion),
    movements: asNumber(raw.movements),
    notes: raw.notes || null,
  };
}

export async function getBudgetMonth(month?: string): Promise<BudgetMonth> {
  const supabase = await createClient();
  const pMonth = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : new Date().toISOString().slice(0,10);
  const { data, error } = await supabase.rpc("financial_app_budget_month", { p_month: pMonth });
  if (error || !data) throw new Error(error?.message || "budget_unavailable");
  const raw = data as any;
  return {
    version: String(raw.version || "0.6.0"),
    month: String(raw.month || pMonth.slice(0,7)),
    assigned: asNumber(raw.assigned),
    spent: asNumber(raw.spent),
    available: asNumber(raw.available),
    overBudgetCount: asNumber(raw.overBudgetCount),
    unbudgetedSpent: asNumber(raw.unbudgetedSpent),
    budgets: Array.isArray(raw.budgets) ? raw.budgets.map(normalizeBudget) : [],
    unbudgeted: Array.isArray(raw.unbudgeted) ? raw.unbudgeted.map((item: any) => ({
      category: String(item.category || "Sin categoría"),
      subcategory: item.subcategory || null,
      spent: asNumber(item.spent),
      suggestion: asNumber(item.suggestion),
      movements: asNumber(item.movements),
    })) : [],
    categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
  };
}
