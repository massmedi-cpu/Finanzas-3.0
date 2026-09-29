import { existsSync, readFileSync } from "node:fs";

const required = [
  [".github/workflows/navigation-performance.yml", ["verify-navigation-performance-10.0.30.mjs", "navigation-performance-10.0.30.spec.ts"]],
  [".github/workflows/extreme-financial-edge-cases.yml", ["extreme-financial-edge-cases-10.0.32.spec.ts", "extreme-financial-scenarios.spec.ts", "analysis-history-integrity.spec.ts", "safe-reversible-edits.spec.ts", "recurrences.spec.ts"]],
  [".github/workflows/document-ocr-edge-cases.yml", ["document-ocr-edge-cases-10.0.33.spec.ts", "document-ocr-contract.spec.ts", "document-ocr-structured-review.spec.ts", "document-ocr-natural-review.spec.ts", "document-ocr-service.spec.ts", "documents.spec.ts"]],
];

const legacy = [
  ".github/workflows/navigation-performance-10.0.30.yml",
  ".github/workflows/extreme-financial-edge-cases-10.0.32.yml",
  ".github/workflows/document-ocr-edge-cases-10.0.33.yml",
];

for (const [file, contracts] of required) {
  if (!existsSync(file)) throw new Error(`missing_reusable_gate:${file}`);
  const source = readFileSync(file, "utf8");
  if (!source.includes("workflow_dispatch:")) throw new Error(`missing_manual_dispatch:${file}`);
  if (/name:\s*.*10\.0\.(30|32|33)/.test(source)) throw new Error(`versioned_gate_name:${file}`);
  for (const contract of contracts) {
    if (!source.includes(contract)) throw new Error(`missing_contract:${file}:${contract}`);
  }
}

for (const file of legacy) {
  if (existsSync(file)) throw new Error(`legacy_gate_still_present:${file}`);
}

console.log(JSON.stringify({
  status: "quality_edge_ci_gates_ok",
  reusableGateCount: required.length,
  removedLegacyGateCount: legacy.length,
}));
