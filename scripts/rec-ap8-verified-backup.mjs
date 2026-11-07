import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This policy is deliberately specific to the reviewed 10.0.103 release and
// the reviewed backup workflow on main. A new production release or a change
// to the trusted main commit requires a new review, not an automatic widening.
export const BACKUP_POLICY = Object.freeze({
  repository: 'massmedi-cpu/Finanzas-3.0',
  repositoryId: 1340586543,
  workflowId: 369930224,
  workflowPath: '.github/workflows/production-backup-v2.yml',
  trustedMainSha: '29a517215fef82cb12bc80e521109c2aa326d46c',
  productionSha: '6dad59c6c2db3575618a7c91c49c3060a93bbba1',
  productionVersion: '10.0.103',
  productionDeployment: 'dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5',
  maxAgeMs: 24 * 60 * 60 * 1000,
  minRemainingMs: 45 * 60 * 1000,
  clockSkewMs: 60 * 1000,
});

export class BackupSelectionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = 'BackupSelectionError';
  }
}

const fail = code => { throw new BackupSelectionError(code); };
const idIsValid = value => Number.isSafeInteger(value) && value > 0;
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return NaN;
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`);
  return new Date(timestamp).toISOString() === canonical ? timestamp : NaN;
};

export function verifyProductionBuild(build, policy = BACKUP_POLICY) {
  if (!build || typeof build !== 'object' || Array.isArray(build)
    || build.environment !== 'production'
    || build.commit !== policy.productionSha
    || build.version !== policy.productionVersion
    || build.deploymentId !== policy.productionDeployment) {
    fail('production_identity_drift');
  }
}

export function selectLatestBackupRun(response, now = Date.now(), policy = BACKUP_POLICY) {
  if (!Number.isFinite(now) || !response || !Array.isArray(response.workflow_runs)
    || !Number.isSafeInteger(response.total_count) || response.total_count < 1
    || response.total_count !== response.workflow_runs.length || response.total_count > 100) {
    fail('backup_run_list_incomplete');
  }
  const runs = response.workflow_runs.map(run => {
    const created = instant(run?.created_at);
    if (!Number.isFinite(created) || !idIsValid(run?.id)) fail('backup_run_invalid');
    return { run, created };
  }).sort((a, b) => b.created - a.created);
  // Never silently select an older run because the latest failed or is
  // ambiguous. A new, verified backup must be produced instead.
  if (runs.length > 1 && runs[0].created === runs[1].created) fail('backup_run_ambiguous');
  const { run, created } = runs[0];
  if (run.name !== 'Production Backup v2' || run.path !== policy.workflowPath
    || run.workflow_id !== policy.workflowId || run.event !== 'workflow_dispatch'
    || run.head_branch !== 'main' || run.head_sha !== policy.trustedMainSha
    || run.repository?.id !== policy.repositoryId || run.head_repository?.id !== policy.repositoryId
    || run.status !== 'completed' || run.conclusion !== 'success'
    || !idIsValid(run.run_attempt)) fail('backup_run_untrusted');
  if (created < now - policy.maxAgeMs || created > now + policy.clockSkewMs) fail('backup_run_not_fresh');
  return run;
}

export function verifyBackupJobs(response, run) {
  const required = ['validate-dispatch', 'backup-v2', 'restore-verify-v2'];
  if (!response || response.total_count !== required.length || !Array.isArray(response.jobs)
    || response.jobs.length !== required.length) fail('backup_jobs_incomplete');
  for (const name of required) {
    const matches = response.jobs.filter(job => job?.name === name);
    if (matches.length !== 1 || matches[0].run_id !== run.id
      || matches[0].run_attempt !== run.run_attempt || matches[0].status !== 'completed'
      || matches[0].conclusion !== 'success') fail('backup_jobs_unverified');
  }
}

export function verifyBackupArtifact(response, run, now = Date.now(), policy = BACKUP_POLICY) {
  if (!response || response.total_count !== 1 || !Array.isArray(response.artifacts)
    || response.artifacts.length !== 1) fail('backup_artifact_ambiguous');
  const a = response.artifacts[0];
  const created = instant(a?.created_at);
  const expires = instant(a?.expires_at);
  const runCreated = instant(run.created_at);
  if (!idIsValid(a?.id) || a.name !== `financial-app-production-v2-${policy.productionSha}`
    || a.expired !== false || !Number.isSafeInteger(a.size_in_bytes) || a.size_in_bytes < 1
    || typeof a.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(a.digest)
    || a.workflow_run?.id !== run.id || a.workflow_run?.repository_id !== policy.repositoryId
    || a.workflow_run?.head_repository_id !== policy.repositoryId
    || a.workflow_run?.head_branch !== 'main' || a.workflow_run?.head_sha !== policy.trustedMainSha
    || !Number.isFinite(created) || !Number.isFinite(expires)
    || created < runCreated - policy.clockSkewMs || created > now + policy.clockSkewMs
    || expires - now < policy.minRemainingMs) fail('backup_artifact_untrusted');
  return a;
}

async function getJson(fetchImpl, url, options, errorCode) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (response.status !== 200) fail(errorCode);
    return await response.json();
  } catch (error) {
    if (error instanceof BackupSelectionError) throw error;
    fail(errorCode);
  }
}

export async function verifyLiveProduction(fetchImpl = fetch) {
  const build = await getJson(fetchImpl, 'https://financialapp-home.vercel.app/api/build', {
    headers: { accept: 'application/json', 'cache-control': 'no-store' },
  }, 'production_identity_unavailable');
  verifyProductionBuild(build);
}

export async function verifyReleaseIdentity({ token, repository, fetchImpl = fetch }) {
  if (repository !== BACKUP_POLICY.repository || typeof token !== 'string' || token.length === 0) {
    fail('backup_context_untrusted');
  }
  await verifyLiveProduction(fetchImpl);
  const base = `https://api.github.com/repos/${BACKUP_POLICY.repository}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28' };
  const main = await getJson(fetchImpl, `${base}/branches/main`, { headers }, 'backup_metadata_unavailable');
  if (main?.commit?.sha !== BACKUP_POLICY.trustedMainSha) fail('trusted_main_identity_drift');
  return { base, headers };
}

export async function findVerifiedRecentBackup({ token, repository, fetchImpl = fetch, now = Date.now() }) {
  if (!Number.isFinite(now)) fail('backup_context_untrusted');
  const { base, headers } = await verifyReleaseIdentity({ token, repository, fetchImpl });
  const since = new Date(now - BACKUP_POLICY.maxAgeMs).toISOString();
  const query = new URLSearchParams({ branch: 'main', event: 'workflow_dispatch', status: 'completed',
    created: `>=${since}`, per_page: '100' });
  const list = await getJson(fetchImpl, `${base}/actions/workflows/${BACKUP_POLICY.workflowId}/runs?${query}`,
    { headers }, 'backup_metadata_unavailable');
  const run = selectLatestBackupRun(list, now);
  const jobs = await getJson(fetchImpl, `${base}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    { headers }, 'backup_metadata_unavailable');
  verifyBackupJobs(jobs, run);
  const artifacts = await getJson(fetchImpl, `${base}/actions/runs/${run.id}/artifacts?per_page=100`,
    { headers }, 'backup_metadata_unavailable');
  const artifact = verifyBackupArtifact(artifacts, run, now);
  return { runId: run.id, artifactId: artifact.id };
}

async function main() {
  if (process.argv[2] === '--verify-release-identity' && process.argv.length === 3) {
    await verifyReleaseIdentity({ token: process.env.GH_TOKEN, repository: process.env.GITHUB_REPOSITORY });
    process.stdout.write('REC_AP8_BACKUP|production_and_main_identity=verified\n');
    return;
  }
  if (process.argv.length !== 2 || !process.env.GITHUB_OUTPUT) fail('backup_context_untrusted');
  const selected = await findVerifiedRecentBackup({ token: process.env.GH_TOKEN, repository: process.env.GITHUB_REPOSITORY });
  // IDs have been validated as positive safe integers; no untrusted string can
  // inject additional GitHub Actions outputs or shell syntax.
  await appendFile(process.env.GITHUB_OUTPUT, `run_id=${selected.runId}\nartifact_id=${selected.artifactId}\n`);
  process.stdout.write(`REC_AP8_BACKUP|stage=selected|run=${selected.runId}|artifact=${selected.artifactId}|fresh=true\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    const code = error instanceof BackupSelectionError ? error.code : 'backup_selection_failed';
    process.stderr.write(`REC_AP8_BACKUP|status=blocked|reason=${code}\n`);
    process.exitCode = 1;
  });
}
