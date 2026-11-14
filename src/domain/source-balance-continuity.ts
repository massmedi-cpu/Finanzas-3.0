export type SourceBalanceContinuity = {
  comparablePairs: number;
  consistentPairs: number;
  discontinuousPairs: number;
  unverifiablePairs: number;
};

type BalanceObservation = {
  accountExternalKey: string;
  amountCents: number;
  balanceAfterCents: number | null;
};

/**
 * Rows must retain the validated newest-first bank order. Group by product,
 * never by physical sheet: a sheet can interleave several accounts.
 * A discontinuity is an observation, not evidence of a missing transaction.
 * Missing balances break the chain; do not bridge them or substitute zero.
 */
export function summarizeSourceBalanceContinuity(
  observations: readonly BalanceObservation[],
): Map<string, SourceBalanceContinuity> {
  const result = new Map<string, SourceBalanceContinuity>();
  const previous = new Map<string, BalanceObservation>();
  for (const observation of observations) {
    if (!Number.isSafeInteger(observation.amountCents)
      || (observation.balanceAfterCents !== null && !Number.isSafeInteger(observation.balanceAfterCents))) {
      throw new RangeError("source_balance_continuity_invalid_money");
    }
    const summary = result.get(observation.accountExternalKey) ?? {
      comparablePairs: 0, consistentPairs: 0, discontinuousPairs: 0, unverifiablePairs: 0,
    };
    const newer = previous.get(observation.accountExternalKey);
    if (newer) {
      if (newer.balanceAfterCents === null || observation.balanceAfterCents === null) {
        summary.unverifiablePairs += 1;
      } else {
        summary.comparablePairs += 1;
        // BigInt also keeps the comparison exact when two individually safe
        // values have a sum outside Number's safe-integer range.
        const expected = BigInt(observation.balanceAfterCents) + BigInt(newer.amountCents);
        if (BigInt(newer.balanceAfterCents) === expected) summary.consistentPairs += 1;
        else summary.discontinuousPairs += 1;
      }
    }
    previous.set(observation.accountExternalKey, observation);
    result.set(observation.accountExternalKey, summary);
  }
  return result;
}
