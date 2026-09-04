import { createHash } from "node:crypto";
import type { MoneyCents } from "./models";

export interface BankSourceIdentityInput {
  sourceFileId: string;
  sourceSheetId: string | null;
  sourceRowKey: string;
  bankDate: string;
  conceptOriginal: string;
  amountCents: MoneyCents;
  balanceAfterCents: MoneyCents | null;
  accountExternalKey: string;
  sourcePayload?: Readonly<Record<string, unknown>>;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)]),
    );
  }
  return value;
}

export function buildSourceRowIdentity(
  input: Pick<BankSourceIdentityInput, "sourceFileId" | "sourceSheetId" | "sourceRowKey">,
) {
  return [
    normalizeText(input.sourceFileId),
    normalizeText(input.sourceSheetId ?? ""),
    normalizeText(input.sourceRowKey),
  ].join("::");
}

export function buildSourceFingerprint(input: BankSourceIdentityInput) {
  const canonical = JSON.stringify({
    sourceFileId: normalizeText(input.sourceFileId),
    sourceSheetId: normalizeText(input.sourceSheetId ?? ""),
    sourceRowKey: normalizeText(input.sourceRowKey),
    bankDate: input.bankDate,
    conceptOriginal: normalizeText(input.conceptOriginal),
    amountCents: input.amountCents,
    balanceAfterCents: input.balanceAfterCents,
    accountExternalKey: normalizeText(input.accountExternalKey),
    sourcePayload: input.sourcePayload ? canonicalizeJson(input.sourcePayload) : undefined,
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
