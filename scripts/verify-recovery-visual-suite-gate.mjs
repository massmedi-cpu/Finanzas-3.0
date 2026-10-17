import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
const cases = [
  ["tests/e2e/documents.spec.ts", ["REC-DOC-139", "REC-DOC-140", "REC-TIME-001"]],
  ["tests/e2e/comparison-ui.spec.ts", ["REC-VIS-002", "REC-SYNC-004"]],
  ["tests/e2e/comparison-ui.spec.ts", ["REC-DATE-002"]],
  ["tests/e2e/analysis.spec.ts", ["REC-DATE-003"]],
  ["tests/e2e/analysis.spec.ts", ["REC-MONTH-002"]],
  ["tests/e2e/budgets.spec.ts", ["REC-MONTH-001"]],
  ["tests/e2e/transactions.spec.ts", ["REC-DATE-004"]],
  ["tests/e2e/forecast-horizons-integrity.spec.ts", ["REC-DATE-005"]],
  ["tests/e2e/premium-analysis-visual.spec.ts", ["REC-VIS-001", "REC-CHART-021", "REC-VIS-006"]],
  ["tests/e2e/analysis-contract-navigation.spec.ts", ["REC-SEC-ANA-001"]],
  ["tests/e2e/aud-e2e-analysis-light-contrast.spec.ts", ["REC-VIS-003"]],
  ["tests/e2e/analysis-error-layout-recovery.spec.ts", ["REC-UI-ANA-016"]],
  ["tests/e2e/recovery-route-shell-responsive.spec.ts", ["REC-VIS-004"]],
  ["tests/e2e/cash-flow-theme-contrast.spec.ts", ["REC-VIS-005"]],
  // These backend-integrity regressions must run, not merely exist in Git.
  ["tests/e2e/financial-api-query-guards.spec.ts", ["REC-OBS-001"]],
  ["tests/e2e/alerts-center.spec.ts", ["REC-UI-ALERT-013"]],
  ["tests/e2e/inicio-sync-feedback.spec.ts", ["REC-HOME-SYNC-015"]],
  ["tests/e2e/document-ocr-natural-review.spec.ts", ["REC-OCR-UI-015"]],
  ["tests/e2e/document-ocr-error-messages.spec.ts", ["REC-OCR-UX-030", "REC-OCR-UX-031", "REC-OCR-UX-032"]],
  ["tests/e2e/document-ocr-post-confirmation-list-sync.spec.ts", ["REC-OCR-MONEY-016"]],
  ["tests/e2e/gateway-request-body-limit.spec.ts", ["REC-SEC-GW-002", "REC-SEC-GW-003", "REC-SEC-GW-004", "REC-SEC-API-005", "REC-SEC-API-006", "REC-CONFIG-SEC-012", "REC-SEC-DOC-014", "REC-SEC-OCR-001"]],
  ["tests/e2e/document-ocr-financial-interpretation.spec.ts", [
    "REC-OCR-150", "REC-OCR-151", "REC-OCR-152",
    "REC-OCR-153", "REC-OCR-154", "REC-OCR-155",
    "REC-OCR-156", "REC-OCR-157", "REC-OCR-158",
    "REC-OCR-159", "REC-OCR-160", "REC-OCR-161",
    "REC-OCR-166", "REC-OCR-167", "REC-OCR-168",
    "REC-OCR-169", "REC-OCR-170", "REC-OCR-171",
    "REC-OCR-172", "REC-OCR-173", "REC-OCR-174", "REC-OCR-175",
    "REC-OCR-176", "REC-OCR-177", "REC-OCR-178", "REC-OCR-179", "REC-OCR-180",
  ]],
  ["tests/e2e/document-ocr-pdf-native-coverage.spec.ts", [
    "REC-OCR-162", "REC-OCR-163", "REC-OCR-164", "REC-OCR-165",
  ]],
  ["tests/e2e/private-document-content-address.spec.ts", ["REC-DOC-117", "REC-DOC-118", "REC-DOC-119"]],
  ["tests/e2e/private-document-replay.spec.ts", ["REC-DOC-110", "REC-DOC-111", "REC-DOC-112", "REC-DOC-120"]],
  ["tests/e2e/document-drive-authoritative-metadata.spec.ts", ["REC-DRIVE-120", "REC-DRIVE-121", "REC-DRIVE-122", "REC-DRIVE-123", "REC-DRIVE-124", "REC-DRIVE-125", "REC-DRIVE-126", "REC-DRIVE-127", "REC-DRIVE-128", "REC-DRIVE-129", "REC-DRIVE-130", "REC-DRIVE-131", "REC-DRIVE-132", "REC-DRIVE-133", "REC-DRIVE-134", "REC-DRIVE-135", "REC-DRIVE-136", "REC-DRIVE-139"]],
  ["tests/e2e/drive-auto-detection-10.0.72.spec.ts", ["REC-DRIVE-137", "REC-DRIVE-138"]],
  ["tests/e2e/google-service-account.spec.ts", ["REC-DOC-NET-010"]],
  ["tests/e2e/document-download-byte-limit.spec.ts", ["REC-DOC-MEM-001", "REC-DOC-MEM-002", "REC-DOC-MEM-003", "REC-DOC-MEM-004", "REC-DOC-MEM-005", "REC-DOC-SEC-011", "REC-DOC-NET-009"]],
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
const visual = workflow.split("name: Browser coverage, theme, keyboard and layout checks")[1]?.split("name: Retain isolated visual screenshots")[0] ?? "";
assert.ok(visual.includes("tests/e2e/product-recovery-visual.spec.ts"), "Product visual regressions must execute");
const visualTests = readFileSync("tests/e2e/product-recovery-visual.spec.ts", "utf8");
for (const id of ["REC-UI-DOC-006", "REC-UI-DOC-007", "REC-UI-DOC-008", "REC-UI-DOC-009"]) {
  assert.ok(visualTests.includes(id), "Mandatory Document visual regression missing: " + id);
}
assert.ok(workflow.includes("'scripts/verify-recovery-visual-suite-gate.mjs'"), "Changes to guard must trigger CI");
assert.ok(workflow.includes("node --experimental-strip-types scripts/test-drive-atomic-batch.mjs"), "Drive rollback behavioral tests must execute BEFORE slow browser matrix");
assert.ok(workflow.includes("'scripts/test-drive-atomic-batch.mjs'"), "Changing Drive rollback tests must retrigger CI");
assert.ok(workflow.includes("node --experimental-strip-types scripts/test-drive-discovery-integrity.mjs"), "Drive discovery pagination tests must execute as early gate");
assert.ok(workflow.includes("'src/infrastructure/google/google-drive-document-discovery.ts'"), "Discovery code changes must trigger CI");
assert.ok(workflow.includes("'src/application/analysis/analysis-contract.ts'"), "Analysis contract changes must retrigger the security browser gate");
assert.ok(workflow.includes("'src/infrastructure/http/gateway-public-error.ts'"), "Gateway error sanitization changes must retrigger the browser security gate");
assert.ok(workflow.includes("'scripts/test-drive-discovery-integrity.mjs'"), "Discovery test changes must trigger CI");
assert.ok(workflow.includes("node scripts/test-ocr-native-engine-smoke.mjs"), "Real Spanish OCR engine must run before browser matrix");
assert.ok(workflow.includes("'scripts/test-ocr-native-engine-smoke.mjs'"), "Real OCR example changes must retrigger CI");
const nativeOcr = readFileSync("scripts/test-ocr-native-engine-smoke.mjs", "utf8");
assert.ok(nativeOcr.includes("OCR_NATIVE_FINANCIAL_VARIANTS|passed="), "Native OCR must exercise and report multiple financial raster patterns");
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

const releaseWorkflows = [
  ".github/workflows/production-backup-v2.yml",
  ".github/workflows/production-postflight.yml",
];
for (const path of releaseWorkflows) {
  const yaml = readFileSync(path, "utf8");
  const actions = [...yaml.matchAll(/^\s+uses:\s+(actions\/(?:checkout|setup-node|upload-artifact|download-artifact))@([^\s]+)/gm)];
  assert.ok(actions.length >= 4, `Expected protected release workflow actions in ${path}`);
  for (const match of actions) {
    assert.match(match[2], /^[a-f0-9]{40}$/, `Mutable release Action tag ${match[1]}@${match[2]} in ${path}`);
  }
  const checkouts = actions.filter((match) => match[1] === "actions/checkout").length;
  const persistenceDisabled = (yaml.match(/persist-credentials:\s*false/g) ?? []).length;
  assert.ok(persistenceDisabled >= checkouts, `Release checkout credentials must never persist in ${path}`);
}
const backupWorkflow = readFileSync(releaseWorkflows[0], "utf8");
assert.ok(backupWorkflow.includes('git merge-base --is-ancestor "$FINANCIAL_APP_SOURCE_COMMIT" "$GITHUB_SHA"'),
  "A secret-bearing production backup may only check out source commits on trusted main history");
const visualWorkflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
for (const path of releaseWorkflows) {
  assert.ok(visualWorkflow.includes("'" + path + "'"), `Release workflow changes must retrigger the CI guard: ${path}`);
}
process.stdout.write("PASS: release workflows pin actions, guard ancestry and do not persist checkout credentials\n");

process.stdout.write("PASS: recovery visual suites are executable by the mandatory browser gate\n");
