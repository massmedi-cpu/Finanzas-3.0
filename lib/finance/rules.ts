import type { CashFlowResult, FinancialMovement } from "@/lib/finance/types";

/**
 * Financial App Axiom: no movement belonging to the savings account may ever
 * contribute to Cash Flow, regardless of its bank-side movement type.
 */
export function isCashFlowComputable(movement: FinancialMovement): boolean {
  if (movement.accountKind === "savings") return false;
  if (movement.isOwnAccountTransfer) return false;
  if (movement.isDuplicate) return false;
  if (movement.excludedFromCashFlow) return false;
  return movement.amountCents !== 0;
}

export function calculateCashFlow(movements: readonly FinancialMovement[]): CashFlowResult {
  let incomeCents = 0;
  let expenseCents = 0;
  const includedSourceIds: string[] = [];

  for (const movement of movements) {
    if (!isCashFlowComputable(movement)) continue;

    includedSourceIds.push(movement.sourceId);
    if (movement.amountCents > 0) incomeCents += movement.amountCents;
    else expenseCents += Math.abs(movement.amountCents);
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    includedSourceIds,
  };
}
