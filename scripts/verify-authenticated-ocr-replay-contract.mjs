import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/cr008-authenticated-replay.yml'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/cr008-authenticated-replay.sh'), 'utf8');
const combined = `${workflow}\n${runner}`;

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "contains(github.event.head_commit.message, '[cr008-auth-replay]')",
  'deployments: read',
  'github.rest.repos.listDeployments',
  'github.rest.repos.listDeploymentStatuses',
  'context.sha',
  'FINANCIAL_APP_QA_EMAIL: ${{ secrets.FINANCIAL_APP_QA_EMAIL }}',
  'FINANCIAL_APP_QA_PASSWORD: ${{ secrets.FINANCIAL_APP_QA_PASSWORD }}',
  'FINANCIAL_APP_CR008_DOCUMENT_ID: ${{ secrets.FINANCIAL_APP_CR008_DOCUMENT_ID }}',
  'bash -n scripts/cr008-authenticated-replay.sh',
  'run: bash scripts/cr008-authenticated-replay.sh',
  'Upload sanitized replay evidence',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`authenticated replay workflow missing required fragment: ${fragment}`);
  }
}

const requiredRunnerFragments = [
  'set -euo pipefail',
  'trap \'rm -f',
  '/api/build',
  'test "$deployed_sha" = "$EXPECTED_SHA"',
  'Internal auth boundary did not fail closed before login',
  '/api/auth/login',
  '--cookie-jar "$COOKIE_JAR"',
  '--cookie "$COOKIE_JAR"',
  '/api/documents?id=$FINANCIAL_APP_CR008_DOCUMENT_ID',
  '/api/documents/ocr?id=$FINANCIAL_APP_CR008_DOCUMENT_ID',
  'assert.deepEqual(after, before',
  "assert.equal(ocr.principles?.bankSource, 'read_only'",
  "assert.equal(ocr.principles?.financialWrites, false",
  "assert.equal(ocr.principles?.requiresHumanReview, true",
  '/api/auth/logout',
  'persistedDocumentUnchanged: true',
];

for (const fragment of requiredRunnerFragments) {
  if (!runner.includes(fragment)) {
    throw new Error(`authenticated replay runner missing required fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  'SUPABASE_SERVICE_ROLE_KEY',
  '/auth/v1/admin/users',
  'INSERT INTO auth.users',
  'insert into auth.users',
  'financialWrites: true',
  'requiresHumanReview: false',
  'bankSource: write',
  '/api/transactions',
  '/api/financial',
  '.jpg',
  '.jpeg',
  'base64,',
];

for (const fragment of forbiddenFragments) {
  if (combined.includes(fragment)) {
    throw new Error(`authenticated replay contract contains forbidden fragment: ${fragment}`);
  }
}

const exactShaIndex = runner.indexOf('Preview SHA does not match expected SHA');
const anonymousBoundaryIndex = runner.indexOf('Internal auth boundary did not fail closed before login');
const loginIndex = runner.indexOf('/api/auth/login');
const ocrIndex = runner.indexOf('/api/documents/ocr?id=$FINANCIAL_APP_CR008_DOCUMENT_ID');
if ([exactShaIndex, anonymousBoundaryIndex, loginIndex, ocrIndex].some((value) => value < 0)) {
  throw new Error('authenticated replay order markers are incomplete');
}
if (!(exactShaIndex < anonymousBoundaryIndex && anonymousBoundaryIndex < loginIndex && loginIndex < ocrIndex)) {
  throw new Error('required order is exact SHA -> anonymous denial -> normal login -> OCR replay');
}

const rawEvidenceMarkers = ['plainText:', 'layoutText:', 'reviewText:', 'originalFileName:'];
for (const marker of rawEvidenceMarkers) {
  if (runner.includes(marker)) {
    throw new Error(`sanitized replay evidence must not persist raw OCR/document content: ${marker}`);
  }
}

if (!workflow.includes("github.event_name == 'workflow_dispatch' ||")) {
  throw new Error('manual mode must remain available once the workflow reaches the default branch');
}
if (!workflow.includes("github.event_name == 'push'")) {
  throw new Error('pre-merge push mode is required so CR-008 can close before this gate reaches main');
}

console.log('CR008_AUTHENTICATED_REPLAY_CONTRACT|status=pass|premerge_push=enabled|manual_dispatch=retained|internal_session=required|financial_writes=false|bank_source=read_only|raw_document_in_repo=false');
