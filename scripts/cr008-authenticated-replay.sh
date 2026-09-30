#!/usr/bin/env bash
set -euo pipefail

: "${PREVIEW_URL:?PREVIEW_URL is required}"
: "${EXPECTED_SHA:?EXPECTED_SHA is required}"
: "${FINANCIAL_APP_QA_EMAIL:?FINANCIAL_APP_QA_EMAIL is required}"
: "${FINANCIAL_APP_QA_PASSWORD:?FINANCIAL_APP_QA_PASSWORD is required}"
: "${FINANCIAL_APP_CR008_DOCUMENT_ID:?FINANCIAL_APP_CR008_DOCUMENT_ID is required}"
: "${VERCEL_TRUSTED_OIDC_TOKEN:=}"
: "${VERCEL_AUTOMATION_BYPASS_SECRET:=}"

[[ "$PREVIEW_URL" =~ ^https://[A-Za-z0-9.-]+\.vercel\.app/?$ ]] || { echo 'preview URL must be a vercel.app HTTPS URL'; exit 1; }
[[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { echo 'expected SHA must be a full commit SHA'; exit 1; }
[[ "$FINANCIAL_APP_CR008_DOCUMENT_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'document id must be a UUID'; exit 1; }

umask 077
PREVIEW_URL="${PREVIEW_URL%/}"
COOKIE_JAR=/tmp/cr008-cookies.txt
BUILD=/tmp/cr008-build.json
LOGIN=/tmp/cr008-login.json
BEFORE=/tmp/cr008-document-before.json
AFTER=/tmp/cr008-document-after.json
OCR=/tmp/cr008-ocr.json
EVIDENCE=/tmp/cr008-authenticated-replay-evidence.json
LOGIN_PAYLOAD=/tmp/cr008-login-payload.json
OUTPUT="$GITHUB_WORKSPACE/cr008-authenticated-replay-evidence.json"
trap 'rm -f "$COOKIE_JAR" "$BUILD" "$LOGIN" "$BEFORE" "$AFTER" "$OCR" "$EVIDENCE" "$LOGIN_PAYLOAD"' EXIT

if [[ -n "$VERCEL_AUTOMATION_BYPASS_SECRET" ]]; then
  PROTECTION_HEADER="x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"
  PROTECTION_METHOD="bypass"
elif [[ -n "$VERCEL_TRUSTED_OIDC_TOKEN" ]]; then
  PROTECTION_HEADER="x-vercel-trusted-oidc-idp-token: $VERCEL_TRUSTED_OIDC_TOKEN"
  PROTECTION_METHOD="oidc"
else
  echo 'No legitimate Vercel protection credential is available.'
  exit 1
fi

build_code=$(curl --silent --show-error --location \
  --output "$BUILD" --write-out '%{http_code}' \
  -H "$PROTECTION_HEADER" \
  "$PREVIEW_URL/api/build")
test "$build_code" = '200' || { echo "Preview build endpoint failed closed: HTTP $build_code"; exit 1; }
deployed_sha=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(j.commit||'')" "$BUILD")
test "$deployed_sha" = "$EXPECTED_SHA" || { echo 'Preview SHA does not match expected SHA'; exit 1; }

anonymous_code=$(curl --silent --show-error --location \
  --output /dev/null --write-out '%{http_code}' \
  -H "$PROTECTION_HEADER" \
  "$PREVIEW_URL/api/documents?id=$FINANCIAL_APP_CR008_DOCUMENT_ID" || true)
case "$anonymous_code" in
  401|403) ;;
  *) echo "Internal auth boundary did not fail closed before login: HTTP $anonymous_code"; exit 1 ;;
esac

node - <<'NODE'
const fs = require('fs');
fs.writeFileSync('/tmp/cr008-login-payload.json', JSON.stringify({
  email: process.env.FINANCIAL_APP_QA_EMAIL,
  password: process.env.FINANCIAL_APP_QA_PASSWORD,
  next: '/documents',
}));
NODE

login_code=$(curl --silent --show-error --location \
  --output "$LOGIN" --write-out '%{http_code}' \
  --cookie-jar "$COOKIE_JAR" \
  -H "$PROTECTION_HEADER" \
  -H 'content-type: application/json' \
  --data-binary @"$LOGIN_PAYLOAD" \
  "$PREVIEW_URL/api/auth/login")
test "$login_code" = '200' || { echo "Legitimate Financial App login failed closed: HTTP $login_code"; exit 1; }
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(j.ok!==true)process.exit(1)" "$LOGIN"

before_code=$(curl --silent --show-error --location \
  --output "$BEFORE" --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" \
  -H "$PROTECTION_HEADER" \
  "$PREVIEW_URL/api/documents?id=$FINANCIAL_APP_CR008_DOCUMENT_ID")
test "$before_code" = '200' || { echo "Authenticated document read failed closed: HTTP $before_code"; exit 1; }

ocr_code=$(curl --silent --show-error --location --max-time 330 \
  --output "$OCR" --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" \
  -H "$PROTECTION_HEADER" \
  "$PREVIEW_URL/api/documents/ocr?id=$FINANCIAL_APP_CR008_DOCUMENT_ID")
test "$ocr_code" = '200' || { echo "Authenticated OCR replay failed closed: HTTP $ocr_code"; exit 1; }

after_code=$(curl --silent --show-error --location \
  --output "$AFTER" --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" \
  -H "$PROTECTION_HEADER" \
  "$PREVIEW_URL/api/documents?id=$FINANCIAL_APP_CR008_DOCUMENT_ID")
test "$after_code" = '200' || { echo "Post-replay document read failed closed: HTTP $after_code"; exit 1; }

node - "$BUILD" "$BEFORE" "$AFTER" "$OCR" "$EVIDENCE" "$EXPECTED_SHA" "$FINANCIAL_APP_CR008_DOCUMENT_ID" "$PROTECTION_METHOD" <<'NODE'
const fs = require('fs');
const assert = require('assert/strict');
const [buildPath, beforePath, afterPath, ocrPath, evidencePath, expectedSha, documentId, protectionMethod] = process.argv.slice(2);
const build = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
const ocr = JSON.parse(fs.readFileSync(ocrPath, 'utf8'));

assert.equal(build.commit, expectedSha, 'deployed SHA drifted');
assert.deepEqual(after, before, 'OCR GET mutated persisted document state');
assert.equal(ocr.contractVersion, 1, 'unexpected OCR contract version');
assert.equal(ocr.documentId, documentId, 'OCR response belongs to another document');
assert.ok(ocr.status === 'ready' || ocr.status === 'needs_review', 'canonical replay must return reviewable OCR evidence');
assert.ok(Array.isArray(ocr.pages) && ocr.pages.length > 0, 'OCR returned no pages');
assert.equal(ocr.principles?.bankSource, 'read_only', 'bank source is not read-only');
assert.equal(ocr.principles?.financialWrites, false, 'OCR unexpectedly allows financial writes');
assert.equal(ocr.principles?.requiresHumanReview, true, 'human review invariant was lost');

const lines = ocr.pages.flatMap((page) => Array.isArray(page.lines) ? page.lines : []);
const lowConfidenceLines = lines.filter((line) => typeof line.confidence === 'number' && line.confidence < 0.65).length;
const receiptStatuses = ocr.pages.map((page) => page.receiptIntegrity?.status).filter(Boolean);
const evidence = {
  certifiedAt: new Date().toISOString(),
  commit: expectedSha,
  environment: build.environment ?? 'preview',
  protectionMethod,
  internalSession: 'authenticated',
  documentIdMatched: true,
  persistedDocumentUnchanged: true,
  status: ocr.status,
  source: ocr.source,
  pageCount: ocr.pages.length,
  lineCount: lines.length,
  lowConfidenceLineCount: lowConfidenceLines,
  warningCount: Array.isArray(ocr.warnings) ? ocr.warnings.length : 0,
  preservesGeometry: ocr.principles.preservesGeometry,
  receiptIntegrityStatuses: receiptStatuses,
  invariants: {
    bankSource: ocr.principles.bankSource,
    financialWrites: ocr.principles.financialWrites,
    requiresHumanReview: ocr.principles.requiresHumanReview,
  },
};
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
console.log(`CR008 authenticated replay passed: ${evidence.pageCount} page(s), ${evidence.lineCount} line(s), status=${evidence.status}.`);
NODE

logout_code=$(curl --silent --show-error --location \
  --output /dev/null --write-out '%{http_code}' \
  --cookie "$COOKIE_JAR" \
  -H "$PROTECTION_HEADER" \
  -X POST "$PREVIEW_URL/api/auth/logout" || true)
case "$logout_code" in
  200|204|302|303|307) ;;
  *) echo "Warning: logout returned HTTP $logout_code; cookie jar will still be destroyed." ;;
esac

cp "$EVIDENCE" "$OUTPUT"
echo 'CR008_AUTHENTICATED_REPLAY|status=pass|internal_session=authenticated|persisted_document_unchanged=true|financial_writes=false'
