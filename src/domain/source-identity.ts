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
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
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
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
