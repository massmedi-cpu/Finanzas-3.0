import type { TransactionSourceRecord } from "./models";
import { buildSourceFingerprint, buildSourceRowIdentity, type BankSourceIdentityInput } from "./source-identity";

export type SourceObservationDecision =
  | { action: "insert"; sourceRowIdentity: string; sourceFingerprint: string; supersedesSourceRecordId: null }
  | { action: "skip"; sourceRowIdentity: string; sourceFingerprint: string; existingSourceRecordId: string }
  | {
      action: "append_revision";
      sourceRowIdentity: string;
      sourceFingerprint: string;
      supersedesSourceRecordId: string;
    };

/**
 * Decide cómo tratar una fila observada sin modificar ninguna instantánea
 * bancaria previa. Mismo identity+fingerprint => idempotencia. Mismo identity
 * con contenido distinto => nueva revisión inmutable enlazada a la anterior.
 */
export function planSourceObservation(
  observation: BankSourceIdentityInput,
  latestExisting: Pick<TransactionSourceRecord, "id" | "sourceRowIdentity" | "sourceFingerprint"> | null,
): SourceObservationDecision {
  const sourceRowIdentity = buildSourceRowIdentity(observation);
  const sourceFingerprint = buildSourceFingerprint(observation);

  if (!latestExisting) {
    return {
      action: "insert",
      sourceRowIdentity,
      sourceFingerprint,
      supersedesSourceRecordId: null,
    };
  }

  if (latestExisting.sourceRowIdentity !== sourceRowIdentity) {
    throw new RangeError("La instantánea existente no corresponde a la misma fila de origen");
  }

  if (latestExisting.sourceFingerprint === sourceFingerprint) {
    return {
      action: "skip",
      sourceRowIdentity,
      sourceFingerprint,
      existingSourceRecordId: latestExisting.id,
    };
  }

  return {
    action: "append_revision",
    sourceRowIdentity,
    sourceFingerprint,
    supersedesSourceRecordId: latestExisting.id,
  };
}
