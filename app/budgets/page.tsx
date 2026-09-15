import AppShell from "../app-shell";
import { loadBudgetSnapshot } from "../../src/application/budgets/budget-loader";
import BudgetsPremiumClient from "./budgets-premium-client";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  let initialSnapshot = null;
  try {
    initialSnapshot = await loadBudgetSnapshot();
  } catch (error) {
    console.error("budgets-initial-snapshot", error instanceof Error ? error.name : typeof error);
  }

  return (
    <AppShell>
      <BudgetsPremiumClient initialSnapshot={initialSnapshot} />
    </AppShell>
  );
}
