import type {
  EntityId,
  Transaction,
  TransactionKind,
  TransactionOverride,
  TransactionReviewState,
} from "./models";

export interface EffectiveTransaction {
  id: EntityId;
  sourceRecordId: EntityId;
  accountId: EntityId;
  bankDate: string;
  concept: string;
  merchantId: EntityId | null;
  categoryId: EntityId | null;
  kind: TransactionKind;
  amountCents: number;
  balanceAfterCents: number | null;
  reviewState: TransactionReviewState;
  duplicateState: Transaction["duplicateState"];
  transferPairId: EntityId | null;
  excludedFromAnalytics: boolean;
  userNote: string | null;
  hasUserOverride: boolean;
}

/**
 * Proyección única de lectura que combina el dato procesado con la capa
 * de modificación del usuario sin alterar la transacción ni el origen.
 */
export function resolveEffectiveTransaction(
  transaction: Readonly<Transaction>,
  override: Readonly<TransactionOverride> | null,
): EffectiveTransaction {
  if (override && override.transactionId !== transaction.id) {
    throw new RangeError("La modificación no pertenece al movimiento indicado");
  }

  return {
    id: transaction.id,
    sourceRecordId: transaction.sourceRecordId,
    accountId: transaction.accountId,
    bankDate: transaction.bankDate,
    concept: override?.conceptOverride ?? transaction.conceptNormalized,
    merchantId: override?.merchantIdOverride ?? transaction.merchantId,
    categoryId: override?.categoryIdOverride ?? transaction.categoryId,
    kind: override?.kindOverride ?? transaction.kind,
    amountCents: transaction.amountCents,
    balanceAfterCents: transaction.balanceAfterCents,
    reviewState: override?.reviewStateOverride ?? transaction.reviewState,
    duplicateState: transaction.duplicateState,
    transferPairId: transaction.transferPairId,
    excludedFromAnalytics: override?.excludedFromAnalytics ?? false,
    userNote: override?.note ?? null,
    hasUserOverride: override !== null,
  };
}
