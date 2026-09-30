import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/cr008-authenticated-replay.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const requiredFragments = [
  'workflow_dispatch:',
  "if: github.event_name == 'workflow_dispatch'",
  'FINANCIAL_APP_QA_EMAIL: ${{ secrets.FINANCIAL_APP_QA_EMAIL }}',
  'FINANCIAL_APP_QA_PASSWORD: ${{ secrets.FINANCIAL_APP_QA_PASSWORD }}',
  'FINANCIAL_APP_CR008_DOCUMENT_ID: ${{ secrets.FINANCIAL_APP_CR008_DOCUMENT_ID }}',
  "test -n \"$FINANCIAL_APP_QA_EMAIL\"",
  "test -n \"$FINANCIAL_APP_QA_PASSWORD\"",
  "test -n \"$FINANCIAL_APP_CR008_DOCUMENT_ID\"",
  '/api/build',
  'test "$deployed_sha" = "$EXPECTED_SHA"',
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
  'Upload sanitized replay evidence',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`authenticated replay contract missing required fragment: ${fragment}`);
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
  'api/transactions" --data',
  'api/transactions\' --data',
  '.jpg',
  '.jpeg',
  'base64,',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`authenticated replay contract contains forbidden fragment: ${fragment}`);
  }
}

const loginIndex = workflow.indexOf('/api/auth/login');
const ocrIndex = workflow.indexOf('/api/documents/ocr?id=$FINANCIAL_APP_CR008_DOCUMENT_ID');
if (loginIndex < 0 || ocrIndex < 0 || loginIndex >= ocrIndex) {
  throw new Error('OCR replay must occur only after the normal Financial App login flow');
}

const anonymousBoundary = workflow.indexOf('Internal auth boundary did not fail closed before login');
if (anonymousBoundary < 0 || anonymousBoundary >= loginIndex) {
  throw new Error('workflow must prove the internal auth boundary rejects the request before login');
}

const exactShaIndex = workflow.indexOf('Preview SHA does not match expected_sha');
if (exactShaIndex < 0 || exactShaIndex >= loginIndex) {
  throw new Error('exact deployed SHA must be verified before app login or OCR');
}

const rawEvidenceMarkers = ['plainText:', 'layoutText:', 'reviewText:', 'originalFileName:'];
for (const marker of rawEvidenceMarkers) {
  if (workflow.includes(marker)) {
    throw new Error(`sanitized replay evidence must not persist raw OCR/document content: ${marker}`);
  }
}

console.log('CR008_AUTHENTICATED_REPLAY_CONTRACT|status=pass|internal_session=required|financial_writes=false|bank_source=read_only|raw_document_in_repo=false');
