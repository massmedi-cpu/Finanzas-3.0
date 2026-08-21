export type FinancialMovement = {
  accountRole: "operating" | "savings" | string;
  amount: number;
  isInternalTransfer?: boolean;
  isDuplicate?: boolean;
  cashFlowOverride?: boolean | null;
};

export function isCashFlowComputable(movement: FinancialMovement): boolean {
  if (movement.accountRole === "savings") return false;
  if (movement.isInternalTransfer) return false;
  if (movement.isDuplicate) return false;
  if (movement.cashFlowOverride === false) return false;
  return true;
}

export function cashFlowOf(movements: FinancialMovement[]): number {
  return movements.filter(isCashFlowComputable).reduce((total, movement) => total + movement.amount, 0);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}
