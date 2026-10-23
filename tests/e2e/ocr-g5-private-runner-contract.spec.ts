import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
test("REC-G5-316 · the private G5 runner never executes on public CI or leaks document evidence", () => {
  const source = readFileSync("tests/e2e/ocr-g5-private-development-local.spec.ts", "utf8");
  const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
  for (const requirement of [
    "FINANCIAL_APP_G5_DEVELOPMENT_DIR", "FINANCIAL_APP_G5_INSPECTION_LEDGER",
    "FINANCIAL_APP_G5_EXPECTATIONS", "assertG5IndependentExpectations(expectedManifest, observed)",
    "matchesG5IndependentTruth(expected.get(document.name)!, financial)",
    "independentTruthMatches", "independentTruthMismatches",
    "test.skip(!PRIVATE_DEV_DIR || !PRIVATE_LEDGER || !PRIVATE_EXPECTATIONS || process.env.GITHUB_ACTIONS === \"true\"",
    "new PdfTextOcrProvider()", "runDocumentOcr({",
    "interpretDocumentOcrFinancially(result)", "readdirSync(root, { withFileTypes: true })",
    "createHash(\"sha256\")", "entry.previouslyInspected !== true", "for (const document of inspected)",
    "assertInspectedG5Ledger(manifest, observed)", "FINANCIAL_APP_G5_INSPECTION_LEDGER",
    "toBe(17)", "No pass threshold", "names_logged=false",
    "amounts_logged=false", "holdout_opened=false", "financial_writes=false",
  ]) expect(source).toContain(requirement);
  expect(source).not.toMatch(/\b(?:fetch\s*\(|axios\b|writeFileSync\b|uploadFile\b)/);
  expect(workflow).toContain("tests/e2e/ocr-g5-private-runner-contract.spec.ts");
  expect(workflow).toContain("tests/e2e/ocr-g5-private-ledger.spec.ts");
  expect(workflow).toContain("tests/e2e/ocr-g5-private-expectations.spec.ts");
  expect(workflow).not.toContain("tests/e2e/ocr-g5-private-development-local.spec.ts");
});


test("REC-G5-362 · selector privado exige 17 desarrollos y 8 reservas, nunca 16+8", () => {
  // Only synthetic fixtures; this test cannot enumerate, open or upload any
  // user's original invoice. The selector itself rejects a 24-PDF inventory.
  const contract = readFileSync("scripts/verify-private-ocr-corpus-selection.mjs", "utf8");
  expect(contract).toContain("development.length !== 17");
  expect(contract).toContain("holdout.length !== 8");
  expect(contract).toContain("files.length < 25");
  expect(contract).toContain("development=17|holdout=8");
  expect(contract).not.toContain("development.length !== 16");
  const output = execFileSync(process.execPath, [
    "scripts/verify-private-ocr-corpus-selection.mjs", "--self-test",
  ], { encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 });
  expect(output).toContain("REC_G5_PRIVATE_CORPUS|status=ok|development=17|holdout=8|roots_limit=12|synthetic_only=true|document_values_logged=false");
});


test("REC-G5-363 · preserves all 17 previously inspected documents across their audited classes", () => {
  const selector = readFileSync("scripts/verify-private-ocr-corpus-selection.mjs", "utf8");
  expect(selector).toContain("const inspectedCounts = [4, 2, 6, 3, 1, 1]");
  expect(selector).toContain("historicalSelection.excludedInspectedCount, 0");
  expect(selector).toContain("historicalSelection.development.every((x) => x.file.previouslyInspected)");
  expect(selector).toContain("historicalSelection.holdout.every((x) => !x.file.previouslyInspected)");
  // This invokes only the synthetic self-test. Real historical PDFs, filenames,
  // SHA-256 ledgers and eight sealed documents remain private and untouched.
  const output = execFileSync(process.execPath, [
    "scripts/verify-private-ocr-corpus-selection.mjs", "--self-test",
  ], { encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 });
  expect(output).toContain("development=17|holdout=8");
});
