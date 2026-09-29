import { existsSync, readFileSync } from "node:fs";

const required = [
  ".github/workflows/final-cleanup.yml",
  ".github/workflows/release-identity.yml",
  ".github/workflows/release-operations-contract.yml",
  "scripts/verify-final-cleanup.mjs",
  "scripts/verify-release-identity.mjs",
  "scripts/verify-release-operations-contract.mjs",
];
const legacy = [
  ".github/workflows/final-cleanup-10.0.34.yml",
  ".github/workflows/release-identity-10.0.36.yml",
  ".github/workflows/release-operations-contract-10.0.37.yml",
  "scripts/verify-final-cleanup-10.0.34.mjs",
  "scripts/verify-release-identity-10.0.36.mjs",
  "scripts/verify-release-operations-contract-10.0.37.mjs",
];
for (const path of required) if (!existsSync(path)) throw new Error(`release_maintenance_missing:${path}`);
for (const path of legacy) if (existsSync(path)) throw new Error(`release_maintenance_legacy_present:${path}`);

for (const path of required.filter((path) => path.startsWith(".github/"))) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("workflow_dispatch:")) throw new Error(`release_maintenance_no_dispatch:${path}`);
  if (/name:\s+.*10\.0\.(?:34|36|37)/.test(source)) throw new Error(`release_maintenance_versioned_name:${path}`);
  for (const branch of ["fix/release-identity-10.0.36", "refactor/release-operations-10.0.37"]) {
    if (source.includes(branch)) throw new Error(`release_maintenance_historical_branch:${path}:${branch}`);
  }
}

console.log(JSON.stringify({ status: "release_maintenance_ci_ok", reusableWorkflows: 3, reusableContracts: 3, legacyFiles: 0 }));
