import { existsSync, readFileSync } from 'node:fs';

const gates = [
  ['sync-missing-persistence', 'tests/e2e/sync-missing-persistence-contract.spec.ts'],
  ['source-incident-trace', 'tests/e2e/source-incident-trace.spec.ts'],
  ['source-health-consistency', 'tests/e2e/source-health-consistency.spec.ts'],
  ['source-trust-appshell', 'tests/e2e/source-trust-app-shell.spec.ts'],
  ['source-trust-cache', 'tests/e2e/source-trust-cache-10.0.31.spec.ts'],
];

const legacy = [
  'sync-missing-persistence-10.0.22',
  'source-incident-trace-10.0.27',
  'source-health-consistency-10.0.28',
  'source-trust-appshell-10.0.29',
  'source-trust-cache-10.0.31',
];

for (const [name, spec] of gates) {
  const workflow = `.github/workflows/${name}.yml`;
  if (!existsSync(workflow)) throw new Error(`missing_generic_workflow:${workflow}`);
  if (!existsSync(spec)) throw new Error(`missing_regression_spec:${spec}`);
  const source = readFileSync(workflow, 'utf8');
  if (!source.includes('pull_request:')) throw new Error(`missing_pull_request_trigger:${workflow}`);
  if (!source.includes('workflow_dispatch:')) throw new Error(`missing_manual_trigger:${workflow}`);
  if (/feature\/[A-Za-z0-9._/-]*10\.0\.\d+/.test(source)) throw new Error(`dead_version_branch_trigger:${workflow}`);
  if (/name:\s*.*10\.0\.\d+/.test(source)) throw new Error(`version_locked_workflow_name:${workflow}`);
  if (!source.includes(spec)) throw new Error(`spec_not_wired:${workflow}`);
}

for (const name of legacy) {
  const workflow = `.github/workflows/${name}.yml`;
  if (existsSync(workflow)) throw new Error(`legacy_workflow_still_present:${workflow}`);
}

console.log(JSON.stringify({ status: 'source_trust_ci_gates_ok', gates: gates.length, legacyRetired: legacy.length }));
