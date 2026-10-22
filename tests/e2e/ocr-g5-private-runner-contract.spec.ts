import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
test("REC-G5-316 · the private G5 runner never executes on public CI or leaks document evidence", () => {
  const source = readFileSync("tests/e2e/ocr-g5-private-development-local.spec.ts", "utf8");
  const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
  for (const requirement of [
    "FINANCIAL_APP_G5_DEVELOPMENT_DIR", "FINANCIAL_APP_G5_INSPECTION_LEDGER",
    "test.skip(!PRIVATE_DEV_DIR || !PRIVATE_LEDGER || process.env.GITHUB_ACTIONS === \"true\"",
    "new PdfTextOcrProvider()", "runDocumentOcr({",
    "interpretDocumentOcrFinancially(result)", "readdirSync(root, { withFileTypes: true })",
    "createHash(\"sha256\")", "entry.previouslyInspected !== true", "for (const document of inspected)",
    "assertInspectedG5Ledger(manifest, observed)", "FINANCIAL_APP_G5_INSPECTION_LEDGER",
    "toBe(17)", "No pass threshold", "names_logged=false",
    "amounts_logged=false", "holdout_opened=false", "financial_writes=false",
  ]) expect(source).toContain(requirement);
  expect(source).not.toMatch(/\b(?:fetch\s*\(|axios|writeFileSync|uploadFile)\b/);
  expect(workflow).toContain("tests/e2e/ocr-g5-private-runner-contract.spec.ts");
  expect(workflow).toContain("tests/e2e/ocr-g5-private-ledger.spec.ts");
  expect(workflow).not.toContain("tests/e2e/ocr-g5-private-development-local.spec.ts");
});
