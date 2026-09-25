import type { AnalysisGatewaySnapshot } from "../analysis/analysis-engine";
import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isComparisonSnapshot } from "./comparison-contract";
import { buildComparisonSnapshot, type ComparisonSnapshot } from "./comparison-engine";
import {
  resolveComparisonSelection,
  type ComparisonSelectionInput,
} from "./comparison-selection";

export type ComparisonGatewayCall = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<AnalysisGatewaySnapshot>;

const defaultGatewayCall: ComparisonGatewayCall = (action, payload) => (
  callPersistenceGateway<AnalysisGatewaySnapshot>(action, payload)
);

export async function loadComparisonSnapshot(
  input: ComparisonSelectionInput = {},
  gatewayCall: ComparisonGatewayCall = defaultGatewayCall,
): Promise<ComparisonSnapshot> {
  const selection = resolveComparisonSelection(input);
  const gateway = await gatewayCall("financial.snapshot", {
    analysis: true,
    today: selection.today,
    dateFrom: selection.primaryFrom,
    dateTo: selection.primaryTo,
    previousDateFrom: selection.referenceFrom,
    previousDateTo: selection.referenceTo,
    historyDateFrom: selection.historyDateFrom,
    budgetMonth: selection.budgetMonth,
    accountId: selection.accountId,
  });
  const snapshot = buildComparisonSnapshot({ selection, gateway });

  if (!isComparisonSnapshot(snapshot)) {
    throw new Error("comparison_contract_invalid");
  }
  return snapshot;
}
