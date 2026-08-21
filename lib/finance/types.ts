export type AccountKind = "current" | "savings" | "other";

export interface FinancialMovement {
  sourceId: string;
  accountKind: AccountKind;
  amountCents: number;
  movementType: string;
  isOwnAccountTransfer?: boolean;
  isDuplicate?: boolean;
  excludedFromCashFlow?: boolean;
}

export interface CashFlowResult {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  includedSourceIds: string[];
}
