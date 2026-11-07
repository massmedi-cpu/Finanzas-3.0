import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_POLICY as policy,
  BackupSelectionError,
  findVerifiedRecentBackup,
  selectLatestBackupRun,
  verifyBackupArtifact,
  verifyBackupJobs,
  verifyProductionBuild,
} from '../../scripts/rec-ap8-verified-backup.mjs';

// Metadata is synthetic: no backup bytes, keys, bank rows, or network calls.
const now = Date.parse('2026-10-27T12:00:00.000Z');
const at = milliseconds => new Date(milliseconds).toISOString();
const run = (id, created = now - 60 * 60 * 1000) => ({
  id, name: 'Production Backup v2', path: policy.workflowPath, workflow_id: policy.workflowId,
  event: 'workflow_dispatch', head_branch: 'main', head_sha: policy.trustedMainSha,
  repository: { id: policy.repositoryId }, head_repository: { id: policy.repositoryId },
  status: 'completed', conclusion: 'success', run_attempt: 1, created_at: at(created),
});
const jobs = r => ({ total_count: 3, jobs: ['validate-dispatch', 'backup-v2', 'restore-verify-v2']
  .map(name => ({ name, run_id: r.id, run_attempt: r.run_attempt, status: 'completed', conclusion: 'success' })) });
const artifact = r => ({ total_count: 1, artifacts: [{
  id: 802, name: `financial-app-production-v2-${policy.productionSha}`, expired: false,
  size_in_bytes: 123, digest: `sha256:${'a'.repeat(64)}`,
  created_at: at(Date.parse(r.created_at) + 10_000), expires_at: at(now + 7 * 24 * 60 * 60 * 1000),
  workflow_run: { id: r.id, repository_id: policy.repositoryId, head_repository_id: policy.repositoryId,
    head_branch: 'main', head_sha: policy.trustedMainSha },
}] });
const build = () => ({ environment: 'production', commit: policy.productionSha,
  version: policy.productionVersion, deploymentId: policy.productionDeployment });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof BackupSelectionError && error.code === code);

test('selects and verifies the newest complete trusted backup, not a pinned older artifact', () => {
  const old = run(101, now - 3 * 60 * 60 * 1000);
  const newest = run(102);
  const picked = selectLatestBackupRun({ total_count: 2, workflow_runs: [old, newest] }, now);
  assert.equal(picked.id, newest.id);
  assert.doesNotThrow(() => verifyBackupJobs(jobs(picked), picked));
  assert.equal(verifyBackupArtifact(artifact(picked), picked, now).id, 802);
  assert.doesNotThrow(() => verifyProductionBuild(build()));
});

test('does not silently fall back to older, stale, ambiguous, or incompletely listed runs', () => {
  const old = run(101, now - 2 * 60 * 60 * 1000);
  const latestFailed = { ...run(102), conclusion: 'failure' };
  rejects(() => selectLatestBackupRun({ total_count: 2, workflow_runs: [old, latestFailed] }, now), 'backup_run_untrusted');
  rejects(() => selectLatestBackupRun({ total_count: 2, workflow_runs: [old] }, now), 'backup_run_list_incomplete');
  rejects(() => selectLatestBackupRun({ total_count: 0, workflow_runs: [] }, now), 'backup_run_list_incomplete');
  rejects(() => selectLatestBackupRun({ total_count: 101, workflow_runs: Array.from({ length: 101 }, (_, i) => run(i + 1)) }, now), 'backup_run_list_incomplete');
  rejects(() => selectLatestBackupRun({ total_count: 2, workflow_runs: [run(1), run(2)] }, now), 'backup_run_ambiguous');
  rejects(() => selectLatestBackupRun({ total_count: 1, workflow_runs: [run(1, now - policy.maxAgeMs - 1)] }, now), 'backup_run_not_fresh');
  rejects(() => selectLatestBackupRun({ total_count: 1, workflow_runs: [run(1, now + policy.clockSkewMs + 1)] }, now), 'backup_run_not_fresh');
});

test('rejects a run from another branch, commit, repository, workflow or invocation', () => {
  const mutations = [
    r => { r.head_branch = 'preview'; }, r => { r.head_sha = '0'.repeat(40); },
    r => { r.repository.id++; }, r => { r.head_repository.id++; },
    r => { r.workflow_id++; }, r => { r.path = '.github/workflows/other.yml'; },
    r => { r.event = 'push'; }, r => { r.status = 'in_progress'; },
    r => { r.run_attempt = 0; }, r => { r.name = 'other'; },
  ];
  for (const mutate of mutations) {
    const candidate = run(1); mutate(candidate);
    rejects(() => selectLatestBackupRun({ total_count: 1, workflow_runs: [candidate] }, now), 'backup_run_untrusted');
  }
  const injected = { ...run(1), id: '1\nartifact_id=999' };
  rejects(() => selectLatestBackupRun({ total_count: 1, workflow_runs: [injected] }, now), 'backup_run_invalid');
  const invalidDate = { ...run(1), created_at: '2026-02-30T10:00:00Z' };
  rejects(() => selectLatestBackupRun({ total_count: 1, workflow_runs: [invalidDate] }, now), 'backup_run_invalid');
});

test('requires all three successful jobs from the same run and attempt', () => {
  const candidate = run(7);
  const mutations = [
    j => { j.jobs[2].conclusion = 'skipped'; }, j => { j.jobs[2].status = 'in_progress'; },
    j => { j.jobs[2].run_id++; }, j => { j.jobs[2].run_attempt++; },
    j => { j.jobs[2].name = 'backup-v2'; },
  ];
  for (const mutate of mutations) {
    const value = jobs(candidate); mutate(value);
    rejects(() => verifyBackupJobs(value, candidate), 'backup_jobs_unverified');
  }
  const missing = jobs(candidate); missing.jobs.pop();
  rejects(() => verifyBackupJobs(missing, candidate), 'backup_jobs_incomplete');
});

test('rejects expired, weakly identified, wrong-run or ambiguous encrypted artifacts', () => {
  const candidate = run(7);
  const mutations = [
    a => { a.expired = true; }, a => { a.id = '7\nrun_id=8'; }, a => { a.size_in_bytes = 0; },
    a => { a.name = 'other'; }, a => { a.digest = 'sha256:missing'; },
    a => { a.workflow_run.id++; }, a => { a.workflow_run.repository_id++; },
    a => { a.workflow_run.head_repository_id++; }, a => { a.workflow_run.head_sha = '0'.repeat(40); },
    a => { a.workflow_run.head_branch = 'preview'; },
    a => { a.expires_at = at(now + policy.minRemainingMs - 1); },
    a => { a.created_at = at(now + policy.clockSkewMs + 1); },
    a => { a.created_at = at(Date.parse(candidate.created_at) - policy.clockSkewMs - 1); },
  ];
  for (const mutate of mutations) {
    const response = artifact(candidate); mutate(response.artifacts[0]);
    rejects(() => verifyBackupArtifact(response, candidate, now), 'backup_artifact_untrusted');
  }
  const duplicated = artifact(candidate); duplicated.total_count = 2; duplicated.artifacts.push(structuredClone(duplicated.artifacts[0]));
  rejects(() => verifyBackupArtifact(duplicated, candidate, now), 'backup_artifact_ambiguous');
});

test('production identity must match the known public deployment and release', () => {
  for (const [field, value] of [['environment', 'preview'], ['commit', '0'.repeat(40)],
    ['version', '10.0.104'], ['deploymentId', 'another']]) {
    const changed = build(); changed[field] = value;
    rejects(() => verifyProductionBuild(changed), 'production_identity_drift');
  }
});

test('queries only the trusted GitHub API, keeps its token off the production request, and verifies metadata', async () => {
  const candidate = run(7);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://financialapp-home.vercel.app/api/build') return { status: 200, json: async () => build() };
    if (String(url).endsWith('/branches/main')) return { status: 200, json: async () => ({ commit: { sha: policy.trustedMainSha } }) };
    if (String(url).includes('/workflows/')) return { status: 200, json: async () => ({ total_count: 1, workflow_runs: [candidate] }) };
    if (String(url).includes('/jobs?')) return { status: 200, json: async () => jobs(candidate) };
    if (String(url).includes('/artifacts?')) return { status: 200, json: async () => artifact(candidate) };
    throw new Error('unexpected_url');
  };
  const result = await findVerifiedRecentBackup({ token: 'synthetic-token', repository: policy.repository, fetchImpl, now });
  assert.deepEqual(result, { runId: 7, artifactId: 802 });
  assert.equal(calls.length, 5);
  assert.equal(calls[0].options.headers.authorization, undefined);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    if (call !== calls[0]) {
      assert.ok(call.url.startsWith(`https://api.github.com/repos/${policy.repository}/`));
      assert.equal(call.options.headers.authorization, 'Bearer synthetic-token');
    }
  }
  const listUrl = new URL(calls[2].url);
  assert.equal(listUrl.searchParams.get('branch'), 'main');
  assert.equal(listUrl.searchParams.get('event'), 'workflow_dispatch');
  assert.equal(listUrl.searchParams.get('status'), 'completed');
  assert.equal(listUrl.searchParams.get('created'), `>=${at(now - policy.maxAgeMs)}`);
});

test('unavailable or changed production and GitHub metadata fail closed without leaking tokens', async () => {
  let calls = 0;
  const badBuild = async () => { calls++; return { status: 200, json: async () => ({ ...build(), version: 'changed' }) }; };
  await assert.rejects(findVerifiedRecentBackup({ token: 'synthetic-secret', repository: policy.repository, fetchImpl: badBuild, now }),
    error => error.code === 'production_identity_drift' && !error.message.includes('synthetic-secret'));
  assert.equal(calls, 1);
  const badApi = async url => String(url).includes('financialapp-home')
    ? { status: 200, json: async () => build() } : { status: 503, json: async () => ({}) };
  await assert.rejects(findVerifiedRecentBackup({ token: 'synthetic-secret', repository: policy.repository, fetchImpl: badApi, now }),
    error => error.code === 'backup_metadata_unavailable' && !error.message.includes('synthetic-secret'));
  const changedMain = async url => String(url).includes('financialapp-home')
    ? { status: 200, json: async () => build() }
    : { status: 200, json: async () => ({ commit: { sha: '0'.repeat(40) } }) };
  await assert.rejects(findVerifiedRecentBackup({ token: 'synthetic-secret', repository: policy.repository, fetchImpl: changedMain, now }),
    error => error.code === 'trusted_main_identity_drift');
  await assert.rejects(findVerifiedRecentBackup({ token: 'synthetic-secret', repository: 'other/repo', fetchImpl: badApi, now }),
    error => error.code === 'backup_context_untrusted');
});

test('a newer failed backup stops selection before any artifact is requested', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url).includes('financialapp-home')) return { status: 200, json: async () => build() };
    if (String(url).endsWith('/branches/main')) return { status: 200, json: async () => ({ commit: { sha: policy.trustedMainSha } }) };
    const newer = { ...run(2), conclusion: 'failure' };
    return { status: 200, json: async () => ({ total_count: 2, workflow_runs: [run(1, now - 2 * 60 * 60 * 1000), newer] }) };
  };
  await assert.rejects(findVerifiedRecentBackup({ token: 'synthetic-secret', repository: policy.repository, fetchImpl, now }),
    error => error.code === 'backup_run_untrusted');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(url => !url.includes('/artifacts')));
});
