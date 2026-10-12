import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
const cases = [
  ["tests/e2e/comparison-ui.spec.ts", ["REC-VIS-002", "REC-SYNC-004"]],
  ["tests/e2e/premium-analysis-visual.spec.ts", ["REC-VIS-001"]],
  ["tests/e2e/aud-e2e-analysis-light-contrast.spec.ts", ["REC-VIS-003"]],
  ["tests/e2e/recovery-route-shell-responsive.spec.ts", ["REC-VIS-004"]],
  ["tests/e2e/cash-flow-theme-contrast.spec.ts", ["REC-VIS-005"]],
  // These backend-integrity regressions must run, not merely exist in Git.
  ["tests/e2e/private-document-content-address.spec.ts", ["REC-DOC-117", "REC-DOC-118", "REC-DOC-119"]],
  ["tests/e2e/private-document-replay.spec.ts", ["REC-DOC-110", "REC-DOC-111", "REC-DOC-112"]],
  ["tests/e2e/document-drive-authoritative-metadata.spec.ts", ["REC-DRIVE-120", "REC-DRIVE-121", "REC-DRIVE-122", "REC-DRIVE-123"]],
];
const integrated = workflow.split("name: Integrated module regressions on the same optimized build")[1]?.split("      # Synthetic UI results")[0] ?? "";
assert.ok(integrated.includes("npx playwright test"), "The real browser test command must exist");
assert.ok(integrated.includes("--project=chromium-desktop --project=chromium-mobile"), "Both browser profiles are mandatory");
for (const [file, casesInFile] of cases) {
  assert.ok(integrated.includes(file), `Workflow fails to execute ${file}`);
  const source = readFileSync(file, "utf8");
  for (const caseId of casesInFile) assert.ok(source.includes(caseId), `${file} lost ${caseId}`);
  process.stdout.write(`PASS: ${file} is executed, ${casesInFile.join(", ")} present\n`);
}
assert.ok(workflow.includes("'scripts/verify-recovery-visual-suite-gate.mjs'"), "Changes to guard must trigger CI");
// A passing browser job is not independently reviewable unless its screenshots
// and failure traces survive the ephemeral CI runner. The first Playwright command
// clears its output on the next run, so preserve both phases separately.
const visualEvidence = workflow.indexOf("Retain isolated visual screenshots before Playwright clears its output directory");
const moduleTests = workflow.indexOf("name: Integrated module regressions on the same optimized build");
const moduleEvidence = workflow.indexOf("Retain integrated module traces and screenshots");
const uploadEvidence = workflow.indexOf("Upload isolated synthetic browser evidence");
assert.ok(visualEvidence > 0 && visualEvidence < moduleTests, "Visual screenshots must be copied before integrated tests overwrite them");
assert.ok(moduleEvidence > moduleTests && uploadEvidence > moduleEvidence, "Integrated browser traces must be preserved and uploaded");
assert.match(workflow, /uses: actions\/upload-artifact@[a-f0-9]{40}/, "Upload action must pin a reviewed full commit SHA");
assert.ok(workflow.includes("retention-days: 7"), "Synthetic browser evidence must have bounded retention");
assert.ok(workflow.includes("path: recovery-evidence/"), "Browser artifact must contain both preserved phases");
process.stdout.write("PASS: synthetic browser screenshots and traces survive the CI runner with bounded retention\n");

process.stdout.write("PASS: recovery visual suites are executable by the mandatory browser gate\n");
