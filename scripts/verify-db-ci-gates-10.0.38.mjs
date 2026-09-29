import { existsSync, readFileSync } from 'node:fs';

const gates = [
  ['category-lifecycle-integrity', 'tests/e2e/category-lifecycle-integrity.spec.ts'],
  ['categorization-rule-indexes', 'tests/e2e/categorization-rule-index-contract.spec.ts'],
  ['transaction-indexes', 'tests/e2e/transaction-index-contract.spec.ts'],
  ['forecast-indexes', 'tests/e2e/forecast-index-contract.spec.ts'],
  ['sync-indexes', 'tests/e2e/sync-index-contract.spec.ts'],
  ['config-recurrence-indexes', 'tests/e2e/config-recurrence-index-contract.spec.ts'],
  ['transaction-support-indexes', 'tests/e2e/transaction-support-index-contract.spec.ts'],
  ['document-deletion-indexes', 'tests/e2e/document-deletion-index-contract.spec.ts'],
];

const legacy = [
  'category-lifecycle-integrity-10.0.13',
  'categorization-rule-indexes-10.0.14',
  'transaction-indexes-10.0.15',
  'forecast-indexes-10.0.16',
  'sync-indexes-10.0.17',
  'config-recurrence-indexes-10.0.18',
  'transaction-support-indexes-10.0.19',
  'document-deletion-indexes-10.0.20',
];

for (const [name, spec] of gates) {
  const workflow = `.github/workflows/${name}.yml`;
  if (!existsSync(workflow)) throw new Error(`missing_generic_workflow:${workflow}`);
  if (!existsSync(spec)) throw new Error(`missing_regression_spec:${spec}`);
  const source = readFileSync(workflow, 'utf8');
  if (!source.includes('pull_request:')) throw new Error(`missing_pull_request_trigger:${workflow}`);
  if (!source.includes('workflow_dispatch:')) throw new Error(`missing_manual_trigger:${workflow}`);
  if (/audit\/[A-Za-z0-9._/-]*10\.0\.\d+/.test(source)) throw new Error(`dead_version_branch_trigger:${workflow}`);
  if (/name:\s*.*10\.0\.\d+/.test(source)) throw new Error(`version_locked_workflow_name:${workflow}`);
  if (!source.includes(spec)) throw new Error(`spec_not_wired:${workflow}`);
}

for (const name of legacy) {
  const workflow = `.github/workflows/${name}.yml`;
  if (existsSync(workflow)) throw new Error(`legacy_workflow_still_present:${workflow}`);
}

console.log(JSON.stringify({ status: 'db_ci_gates_ok', gates: gates.length, legacyRetired: legacy.length }));
