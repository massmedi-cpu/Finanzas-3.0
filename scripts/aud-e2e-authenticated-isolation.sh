#!/usr/bin/env bash
set -euo pipefail

# Real Supabase Auth/Storage/Postgres on the disposable GitHub runner only.
# No cloud project is created, linked, read or written. No repository secrets.
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'AUD_AUTH|ci_runner_required'; exit 1; }
[[ "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || exit 1
suite="${AUD_ISOLATED_SUITE:-acceptance}"
[[ "$suite" == acceptance || "$suite" == capacity ]] || { echo 'AUD_AUTH|invalid_suite'; exit 1; }
for forbidden in SUPABASE_ACCESS_TOKEN FINANCIAL_APP_DB_URL VERCEL_OIDC_TOKEN GOOGLE_SERVICE_ACCOUNT_JSON; do
  [[ -z "${!forbidden:-}" ]] || { echo 'AUD_AUTH|external_credentials_forbidden'; exit 1; }
done
command -v docker >/dev/null
workdir="$(mktemp -d)"
export AUD_ISOLATED_DIR="$workdir"
cleanup() {
  for pid in "${gateway_pid:-}" "${jwks_pid:-}"; do
    [[ -z "$pid" ]] || kill "$pid" 2>/dev/null || true
  done
  rm -f supabase/functions/financial-app-db-gateway/index.aud-local.ts
  npx --yes supabase@2.120.0 stop --workdir "$workdir" --no-backup >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT

npx --yes supabase@2.120.0 init --workdir "$workdir" >/dev/null
# Auth accounts are provisioned directly via admin.createUser({ email_confirm: true }).
# Mail testing is not part of this isolated Auth/RLS/Storage/capacity suite.
# Disable the optional Inbucket container: port 54324 can be occupied on a
# GitHub runner and must not prevent genuine PostgreSQL from being measured.
node - "$workdir/supabase/config.toml" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const config = fs.readFileSync(file, 'utf8');
// Supabase CLI can leave the default enabled=true implicit in config.toml.
// Handle explicit true, explicit false and absent [inbucket] without changing
// Auth, Postgres or Storage. All changes remain inside this disposable workdir.
const marker = /^(\[inbucket\]\r?\n)/m;
let updated;
const found = config.match(marker);
if (!found) {
  updated = config.replace(/\s*$/, '\n') + '[inbucket]\nenabled = false\n';
} else {
  const start = found.index + found[0].length;
  const relativeNext = config.slice(start).search(/^\[[^\r\n]+\]/m);
  const end = relativeNext < 0 ? config.length : start + relativeNext;
  let body = config.slice(start, end);
  if (/^enabled\s*=\s*(?:true|false)\s*$/m.test(body)) {
    body = body.replace(/^enabled\s*=\s*(?:true|false)\s*$/m, 'enabled = false');
  } else {
    body = 'enabled = false\n' + body;
  }
  updated = config.slice(0, start) + body + config.slice(end);
}
if (!/\[inbucket\]\r?\nenabled = false/.test(updated)) {
  throw new Error('local_mail_capture_not_disabled');
}
fs.writeFileSync(file, updated);
process.stdout.write('AUD_AUTH|mail_capture_disabled=true|db_auth_storage_intact=true\n');
NODE
# Start Auth, REST and Storage against the genuine managed schemas, not stubs.
# Migrations are copied verbatim before start; no production bootstrap data.
cp -a supabase/migrations "$workdir/supabase/migrations"
npx --yes supabase@2.120.0 start --workdir "$workdir" \
  --exclude realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  >"$workdir/start.log" 2>&1 || { tail -60 "$workdir/start.log"; exit 1; }
npx --yes supabase@2.120.0 status --workdir "$workdir" --output json >"$workdir/status.json"

# Allowlisted local values only. Never source command output as shell code.
node - <<'NODE' >"$workdir/local.env"
const fs = require('node:fs');
const status = JSON.parse(fs.readFileSync(process.env.AUD_ISOLATED_DIR + '/status.json', 'utf8'));
for (const name of ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
  if (typeof status[name] !== 'string' || !status[name]) throw new Error('missing_local_status_' + name);
}
for (const name of ['API_URL', 'DB_URL']) {
  const url = new URL(status[name]);
  if (url.hostname !== '127.0.0.1' || (name === 'API_URL' && url.protocol !== 'http:')) throw new Error('nonlocal_status');
}
for (const [name, value] of Object.entries({
  SUPABASE_URL: status.API_URL, SUPABASE_DB_URL: status.DB_URL,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  FINANCIAL_APP_AUTH_ENFORCED: 'true',
})) {
  if (/[\r\n']/u.test(value)) throw new Error('invalid_local_env');
  if (name.includes('KEY')) process.stderr.write('::add-mask::' + value + '\n');
  process.stdout.write(name + "='" + value + "'\n");
}
NODE
set -a
source "$workdir/local.env"
set +a

npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
  --allow-read --allow-write="$workdir" \
  --config supabase/functions/financial-app-db-gateway/deno.json \
  supabase/tests/aud_e2e_authenticated.ts prepare
node scripts/aud-e2e-http-runtime.mjs prepare
set -a
source "$workdir/http.env"
set +a
node scripts/aud-e2e-http-runtime.mjs serve >"$workdir/jwks.log" 2>&1 &
jwks_pid=$!
npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
  --allow-read --config supabase/functions/financial-app-db-gateway/deno.json \
  supabase/functions/financial-app-db-gateway/index.aud-local.ts >"$workdir/gateway.log" 2>&1 &
gateway_pid=$!
for attempt in $(seq 1 90); do
  if curl -s --max-time 1 -o /dev/null http://127.0.0.1:54331; then break; fi
  if ! kill -0 "$gateway_pid" 2>/dev/null; then tail -30 "$workdir/gateway.log"; exit 1; fi
  sleep 1
done
curl -fs --max-time 2 http://127.0.0.1:54330/jwks >/dev/null
# REC-AUTH-364: Share one optimized build contract between acceptance and
# capacity. Next dev may compile route bundles while the disposable DB/Auth,
# Storage and Deno gateway are already resident; a CI resource crash then
# appears as dozens of unrelated HTTP 500s. Test the production server.
NODE_OPTIONS='--require ./scripts/aud-e2e-local-network.cjs' npm run build
if ! kill -0 "$gateway_pid" 2>/dev/null ||
  ! curl -s --max-time 3 -o /dev/null http://127.0.0.1:54331; then
  echo "AUD_AUTH|stage=post_build|local_gateway_unavailable=true"
  exit 1
fi
if [[ "$suite" == capacity ]]; then
  npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
    --allow-read --allow-write="$workdir" \
    --config supabase/functions/financial-app-db-gateway/deno.json \
    supabase/tests/aud_e2e_capacity.ts prepare
  # Measure the optimized application, never next dev or an external preview.
  capacity_status=0
  npx playwright test --config=playwright.authenticated-capacity.config.ts || capacity_status=$?
  npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
    --allow-read --config supabase/functions/financial-app-db-gateway/deno.json \
    supabase/tests/aud_e2e_capacity.ts verify
  [[ "$capacity_status" == 0 ]] || exit "$capacity_status"
  echo "AUD_CAPACITY|status=ok|optimized_next=true|auth_gateway_postgres=true|cloud_access=false|sha=$AUD_VALIDATION_SHA"
  exit 0
fi
auth_status=0
npx playwright test --config=playwright.authenticated-isolation.config.ts || auth_status=$?
if ! kill -0 "$gateway_pid" 2>/dev/null; then
  echo "AUD_AUTH|stage=post_browser|local_gateway_exited=true"
  exit 1
fi
[[ "$auth_status" == 0 ]] || exit "$auth_status"
npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
  --allow-read --allow-write="$workdir" \
  --config supabase/functions/financial-app-db-gateway/deno.json \
  supabase/tests/aud_e2e_authenticated.ts verify
echo "AUD_AUTH|status=ok|real_supabase_auth=true|real_storage=true|ocr_persisted=true|browser_next_gateway_http=true|oidc_signer=disposable_test_key|cloud_access=false|sha=$AUD_VALIDATION_SHA"
