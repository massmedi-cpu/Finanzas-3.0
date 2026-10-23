import type { DocumentOcrFinancialInterpretation } from "../../../src/domain/document-ocr-financial-interpretation";

// REC-G5-340. Only owner-local, independently reviewed GOLD values.
// Never log or upload this manifest. A filename amount is not gold truth.
export type G5IndependentExpectation = Readonly<{
  name: string;
  sha256: string;
  reviewedIndependently: true;
  totalCents: number;
  date: string | null;
  issuer: string | null;
  taxBaseCents: number | null;
  taxesCents: number | null;
  minimumLineItems: number;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const EXPECTATION_FIELDS = [
  "name", "sha256", "reviewedIndependently", "totalCents",
  "date", "issuer", "taxBaseCents", "taxesCents", "minimumLineItems",
] as const;

function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(v + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}
function money(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}
function fail(): never {
  // No document name, amount, account, path or OCR text in the error.
  throw new Error("g5_private_independent_expectations_invalid");
}

/**
 * Strict one-to-one linkage with the verified development ledger.
 * Holdout documents must never occur in either argument.
 */
export function assertG5IndependentExpectations(
  manifest: unknown,
  verifiedDevelopment: readonly { name: string; sha256: string }[],
): Map<string, G5IndependentExpectation> {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail();
  const payload = manifest as Record<string, unknown>;
  if (Object.keys(payload).sort().join(",") !== "documents,schemaVersion"
      || payload.schemaVersion !== 1 || !Array.isArray(payload.documents)
      || payload.documents.length !== 17 || verifiedDevelopment.length !== 17) fail();
  const byName = new Map<string, G5IndependentExpectation>();
  const reviewed = new Map<string, string>();
  for (const file of verifiedDevelopment) {
    if (!file || typeof file.name !== "string" || !SHA256.test(file.sha256)
        || reviewed.has(file.name)) fail();
    reviewed.set(file.name, file.sha256);
  }
  for (const candidate of payload.documents) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail();
    const row = candidate as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== [...EXPECTATION_FIELDS].sort().join(",")
        || typeof row.name !== "string" || typeof row.sha256 !== "string"
        || !SHA256.test(row.sha256) || reviewed.get(row.name) !== row.sha256
        || byName.has(row.name) || row.reviewedIndependently !== true
        || !money(row.totalCents)
        || !(row.date === null || validDate(row.date))
        || !(row.issuer === null || (typeof row.issuer === "string"
          && row.issuer.trim().length > 0 && row.issuer.length <= 240))
        || !(row.taxBaseCents === null || money(row.taxBaseCents))
        || !(row.taxesCents === null || money(row.taxesCents))
        || !Number.isSafeInteger(row.minimumLineItems)
        || (row.minimumLineItems as number) < 0
        || (row.minimumLineItems as number) > 500) fail();
    byName.set(row.name, row as G5IndependentExpectation);
  }
  if (byName.size !== 17) fail();
  return byName;
}

function normalizedIssuer(value: string | null) {
  return value?.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ").trim().toLowerCase() ?? null;
}

/** A mismatch is a failed certification, not a reason to invent or edit amounts. */
export function matchesG5IndependentTruth(
  expected: G5IndependentExpectation,
  financial: DocumentOcrFinancialInterpretation,
): boolean {
  return financial.totalCents.value === expected.totalCents
    && financial.date.value === expected.date
    && normalizedIssuer(financial.issuer.value) === normalizedIssuer(expected.issuer)
    && financial.taxBaseCents.value === expected.taxBaseCents
    && financial.taxesCents.value === expected.taxesCents
    && financial.lines.length >= expected.minimumLineItems;
}
