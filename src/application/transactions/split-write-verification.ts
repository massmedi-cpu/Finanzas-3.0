/** The exact, user-submitted parts of a split, in their displayed order. */
export type SplitWriteAllocation = {
  amountCents: number;
  scope: "personal" | "other";
  categoryId: string | null;
  label: string | null;
};

/**
 * The SQL split snapshot does not contain a transaction ID. Compare the full
 * submitted split with both the mutation receipt and a separate read for the
 * requested transaction before claiming it was saved.
 */
export function matchesRequestedSplit(
  value: unknown,
  bankAmountCents: number,
  expected: SplitWriteAllocation[],
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!Number.isSafeInteger(bankAmountCents) || result.bankAmountCents !== bankAmountCents
    || !Array.isArray(result.allocations) || result.allocations.length !== expected.length
    || result.allocationCount !== expected.length) return false;

  if (expected.length === 0) {
    return result.exists === false && result.active === false && result.stale === false
      && result.sourceAmountCents === null && result.personalAmountCents === bankAmountCents
      && result.otherAmountCents === 0;
  }
  if (result.exists !== true || result.active !== true || result.stale !== false
    || result.sourceAmountCents !== bankAmountCents) return false;

  let personal = BigInt(0);
  let other = BigInt(0);
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const line = result.allocations[index];
    if (!Number.isSafeInteger(wanted.amountCents) || !line || typeof line !== "object" || Array.isArray(line)
      || line.position !== index || line.amountCents !== wanted.amountCents || line.scope !== wanted.scope
      || line.categoryId !== wanted.categoryId || line.label !== wanted.label) return false;
    if (wanted.scope === "personal") personal += BigInt(wanted.amountCents);
    else other += BigInt(wanted.amountCents);
  }
  return personal + other === BigInt(bankAmountCents)
    && Number.isSafeInteger(result.personalAmountCents)
    && Number.isSafeInteger(result.otherAmountCents)
    && BigInt(result.personalAmountCents as number) === personal
    && BigInt(result.otherAmountCents as number) === other;
}
