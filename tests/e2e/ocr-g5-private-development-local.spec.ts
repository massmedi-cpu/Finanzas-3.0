import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { interpretDocumentOcrFinancially } from "../../src/domain/document-ocr-financial-interpretation";

// REC-G5-315: owner-local ONLY. Never read folders recursively or output
// filenames, amounts, private PDFs, OCR text, individual errors or identifiers.
const PRIVATE_DEV_DIR = process.env.FINANCIAL_APP_G5_DEVELOPMENT_DIR ?? "";
const PRIVATE_LEDGER = process.env.FINANCIAL_APP_G5_INSPECTION_LEDGER ?? "";
test.skip(!PRIVATE_DEV_DIR || !PRIVATE_LEDGER || process.env.GITHUB_ACTIONS === "true",
  "Never open private owner documents on GitHub Actions, even if a variable is set");

function referenceCents(name: string): number | null {
  const m = name.match(/[-–]\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR)\.pdf$/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) : null;
}

test("REC-G5-315 · run actual Financial App PDF and financial interpreter on previously inspected private development documents", async () => {
  test.setTimeout(25 * 60_000);
  const root = realpathSync(resolve(PRIVATE_DEV_DIR));
  const filenames = readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.toLowerCase().endsWith(".pdf"))
    .map((item) => item.name).sort();
  expect(filenames.length, "private_g5_development_inventory").toBe(17);
  // REC-G5-318: the manifest is private, never in GitHub or CI. Verify ALL
  // already-opened files before submitting even the first PDF to OCR.
  const reject = () => { throw new Error("g5_private_inspection_ledger_invalid"); };
  let manifest: unknown;
  try { manifest = JSON.parse(readFileSync(realpathSync(resolve(PRIVATE_LEDGER)), "utf8")); }
  catch { reject(); }
  const ledger = manifest as { schemaVersion?: unknown; documents?: unknown };
  if (!ledger || ledger.schemaVersion !== 1 || !Array.isArray(ledger.documents)
      || ledger.documents.length !== 17) reject();
  const allowed = new Map<string,string>();
  for (const entry of ledger.documents as Array<{ name?: unknown; previouslyInspected?: unknown; sha256?: unknown }>) {
    if (!entry || typeof entry.name !== "string" || typeof entry.sha256 !== "string"
        || !/^[0-9a-f]{64}$/.test(entry.sha256) || entry.previouslyInspected !== true
        || !filenames.includes(entry.name) || allowed.has(entry.name)) reject();
    allowed.set(entry.name, entry.sha256);
  }
  const inspected: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const name of filenames) {
    const filename = join(root, name);
    if (!lstatSync(filename).isFile()) reject();
    const bytes = readFileSync(filename);
    if (bytes.length < 1000 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
        || createHash("sha256").update(bytes).digest("hex") !== allowed.get(name)) reject();
    inspected.push({ name, bytes: new Uint8Array(bytes) });
  }
  const aggregate = {
    documents: filenames.length, extracted: 0, failed: 0,
    pdfNative: 0, pdfVisualOrHybrid: 0, totalDetected: 0, totalMissing: 0,
    totalReliable: 0, totalDoubtful: 0, amountReferenceAvailable: 0,
    totalMatchesFilenameHint: 0, dateDetected: 0, issuerDetected: 0, warnings: 0,
  };
  const provider = new PdfTextOcrProvider();
  for (const document of inspected) {
    const hint = referenceCents(document.name);
    if (hint !== null) aggregate.amountReferenceAvailable++;
    try {
      const result = await runDocumentOcr({
        documentId: "00000000-0000-4000-8000-000000000315",
        bytes: document.bytes,
        mimeType: "application/pdf",
        originalFileName: "documento-privado.pdf",
        provider,
      });
      aggregate.extracted++;
      if (result.source === "pdf_text") aggregate.pdfNative++;
      else aggregate.pdfVisualOrHybrid++;
      const financial = interpretDocumentOcrFinancially(result);
      if (financial.totalCents.value === null) aggregate.totalMissing++;
      else {
        aggregate.totalDetected++;
        if (financial.totalCents.trust === "reliable") aggregate.totalReliable++;
        if (financial.totalCents.trust === "doubtful") aggregate.totalDoubtful++;
        if (hint !== null && financial.totalCents.value === hint)
          aggregate.totalMatchesFilenameHint++;
      }
      if (financial.date.value !== null) aggregate.dateDetected++;
      if (financial.issuer.value !== null) aggregate.issuerDetected++;
      aggregate.warnings += result.warnings.length + financial.warnings.length;
    } catch {
      // PDF errors can contain private information; discard raw messages.
      aggregate.failed++;
    }
  }
  console.log("REC_G5_LOCAL_ENGINE|" + Object.entries(aggregate)
    .map(([key, value]) => key + "=" + value).join("|") +
    "|names_logged=false|amounts_logged=false|holdout_opened=false|financial_writes=false");
  expect(aggregate.extracted + aggregate.failed).toBe(17);
  expect(aggregate.failed, "g5_real_pdf_engine_failures").toBe(0);
  // Filename amounts are hints, not audited ground truth. No pass threshold
  // is applied to totalMatchesFilenameHint; holdout requires separate review.
});
