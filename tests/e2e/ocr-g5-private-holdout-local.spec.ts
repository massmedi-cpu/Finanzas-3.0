import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { assertG5HoldoutFreeze } from "./support/g5-private-holdout-freeze";
import { assertG5HoldoutExpectations, matchesG5IndependentTruth } from "./support/g5-private-independent-expectations";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { interpretDocumentOcrFinancially } from "../../src/domain/document-ocr-financial-interpretation";

// REC-G5-344: owner-local only. Never run in GitHub Actions, even with env vars.
const ROOT = process.env.FINANCIAL_APP_G5_HOLDOUT_DIR ?? "";
const FREEZE = process.env.FINANCIAL_APP_G5_HOLDOUT_FREEZE ?? "";
const HISTORY = process.env.FINANCIAL_APP_G5_INSPECTION_LEDGER ?? "";
const TRUTH = process.env.FINANCIAL_APP_G5_HOLDOUT_EXPECTATIONS ?? "";
test.skip(!ROOT || !FREEZE || !HISTORY || !TRUTH || process.env.GITHUB_ACTIONS === "true",
  "Private holdout requires an independently frozen owner-only evaluation");

const fail = (code: string): never => { throw new Error(code); };

function privateJson(path: string): unknown {
  try { return JSON.parse(readFileSync(realpathSync(resolve(path)), "utf8")); }
  catch { return fail("g5_holdout_private_manifest_invalid"); }
}

test("REC-G5-344 · freeze eight previously unopened PDFs before private OCR evaluation", async () => {
  test.setTimeout(20 * 60_000);
  // Code identity is checked before reading even one private PDF.
  let head: string;
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // git status only inspects tracked implementation files, not the private holdout.
    const dirty = execFileSync("git", ["status", "--porcelain", "--",
      "src/domain/document-ocr-financial-interpretation.ts",
      "src/application/document-ocr-service.ts",
      "src/infrastructure/ocr/pdf-text-provider.ts",
      "tests/e2e/support/g5-private-independent-expectations.ts",
      "tests/e2e/support/g5-private-holdout-freeze.ts",
      "tests/e2e/ocr-g5-private-holdout-local.spec.ts",
      "package-lock.json",
    ], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (dirty) fail("g5_holdout_freeze_invalid");
  } catch { return fail("g5_holdout_freeze_invalid"); }

  let names: string[]; let root: string;
  try {
    root = realpathSync(resolve(ROOT));
    const entries = readdirSync(root, { withFileTypes: true });
    // A symlink with .pdf extension fails instead of being silently ignored.
    if (entries.some(x => x.name.toLowerCase().endsWith(".pdf") && !x.isFile()))
      fail("g5_holdout_inventory_invalid");
    names = entries.filter(x => x.isFile() && x.name.toLowerCase().endsWith(".pdf"))
      .map(x => x.name).sort();
  } catch { return fail("g5_holdout_inventory_invalid"); }

  // Reject wrong selection, old inspected files, duplicate names and changed
  // commit BEFORE opening ANY of the eight reserved documents.
  assertG5HoldoutFreeze(privateJson(FREEZE), privateJson(HISTORY), names, head);

  const documents: Array<{ name: string; sha256: string; bytes: Uint8Array }> = [];
  for (const name of names) {
    try {
      const full = join(root, name);
      if (!lstatSync(full).isFile()) fail("g5_holdout_document_invalid");
      const bytes = readFileSync(full);
      if (bytes.length < 1000 || bytes.length > 30_000_000
          || bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
        fail("g5_holdout_document_invalid");
      documents.push({
        name, sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: new Uint8Array(bytes),
      });
    } catch { return fail("g5_holdout_document_invalid"); }
  }

  // Gold references come from independent review after the code freeze:
  // never infer numbers from filenames or OCR output.
  const gold = assertG5HoldoutExpectations(privateJson(TRUTH),
    documents.map(({ name, sha256 }) => ({ name, sha256 })));

  const provider = new PdfTextOcrProvider();
  let extracted = 0; let failed = 0; let matched = 0; let mismatched = 0;
  for (const document of documents) {
    try {
      const ocr = await runDocumentOcr({
        documentId: "00000000-0000-4000-8000-000000000344",
        bytes: document.bytes, mimeType: "application/pdf",
        originalFileName: "documento-reservado.pdf", provider,
      });
      const financial = interpretDocumentOcrFinancially(ocr);
      extracted++;
      if (matchesG5IndependentTruth(gold.get(document.name)!, financial)) matched++;
      else mismatched++;
    } catch {
      // Private errors may contain invoice text; never surface them in logs.
      failed++;
    }
  }
  console.log("REC_G5_PRIVATE_HOLDOUT|documents=8|extracted=" + extracted
    + "|failed=" + failed + "|gold_matches=" + matched + "|gold_mismatches=" + mismatched
    + "|holdout_opened_after_freeze=true|names_logged=false|amounts_logged=false|financial_writes=false");
  expect(extracted).toBe(8);
  expect(failed).toBe(0);
  expect(matched).toBe(8);
  expect(mismatched).toBe(0);
});
