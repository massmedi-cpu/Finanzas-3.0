import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { interpretDocumentOcrFinancially } from "../../src/domain/document-ocr-financial-interpretation";

// REC-G5-315: owner-local ONLY. Never read folders recursively or output
// filenames, amounts, private PDFs, OCR text, individual errors or identifiers.
const PRIVATE_DEV_DIR = process.env.FINANCIAL_APP_G5_DEVELOPMENT_DIR ?? "";
test.skip(!PRIVATE_DEV_DIR || process.env.GITHUB_ACTIONS === "true",
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
  const aggregate = {
    documents: filenames.length, extracted: 0, failed: 0,
    pdfNative: 0, pdfVisualOrHybrid: 0, totalDetected: 0, totalMissing: 0,
    totalReliable: 0, totalDoubtful: 0, amountReferenceAvailable: 0,
    totalMatchesFilenameHint: 0, dateDetected: 0, issuerDetected: 0, warnings: 0,
  };
  const provider = new PdfTextOcrProvider();
  for (const name of filenames) {
    const path = join(root, name);
    if (!lstatSync(path).isFile()) { aggregate.failed++; continue; }
    const hint = referenceCents(name);
    if (hint !== null) aggregate.amountReferenceAvailable++;
    try {
      const result = await runDocumentOcr({
        documentId: "00000000-0000-4000-8000-000000000315",
        bytes: new Uint8Array(readFileSync(path)),
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
