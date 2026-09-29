import { existsSync, readFileSync } from "node:fs";

const required = [
  [".github/workflows/cross-module-financial-consistency.yml", ["cross-module-financial-consistency.spec.ts", "regional-home-consistency.spec.ts"]],
  [".github/workflows/extreme-financial-scenarios.yml", ["extreme-financial-scenarios.spec.ts"]],
  [".github/workflows/sign-mismatch-review.yml", ["sign-mismatch-review.spec.ts"]],
  [".github/workflows/review-sign-mismatch.yml", ["review-action-center.spec.ts", "review-center.spec.ts"]],
];

const legacy = [
  ".github/workflows/cross-module-financial-consistency-10.0.23.yml",
  ".github/workflows/extreme-financial-scenarios-10.0.24.yml",
  ".github/workflows/sign-mismatch-review-10.0.25.yml",
  ".github/workflows/review-sign-mismatch-10.0.26.yml",
];

for (const [file, suites] of required) {
  if (!existsSync(file)) throw new Error(`missing_reusable_gate:${file}`);
  const source = readFileSync(file, "utf8");
  if (!source.includes("workflow_dispatch:")) throw new Error(`missing_manual_dispatch:${file}`);
  if (/name:\s*.*10\.0\.(23|24|25|26)/.test(source)) throw new Error(`versioned_gate_name:${file}`);
  if (source.includes("Version consistency")) throw new Error(`duplicate_version_contract:${file}`);
  for (const suite of suites) {
    if (!source.includes(suite)) throw new Error(`missing_suite:${file}:${suite}`);
  }
}

for (const file of legacy) {
  if (existsSync(file)) throw new Error(`legacy_gate_still_present:${file}`);
}

console.log(JSON.stringify({
  status: "financial_consistency_ci_gates_ok",
  reusableGateCount: required.length,
  removedLegacyGateCount: legacy.length,
}));
