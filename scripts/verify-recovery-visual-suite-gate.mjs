import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
const cases = [
  ["tests/e2e/comparison-ui.spec.ts", ["REC-VIS-002", "REC-SYNC-004"]],
  ["tests/e2e/premium-analysis-visual.spec.ts", ["REC-VIS-001"]],
  ["tests/e2e/aud-e2e-analysis-light-contrast.spec.ts", ["REC-VIS-003"]],
  ["tests/e2e/recovery-route-shell-responsive.spec.ts", ["REC-VIS-004"]],
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
process.stdout.write("PASS: recovery visual suites are executable by the mandatory browser gate\n");
