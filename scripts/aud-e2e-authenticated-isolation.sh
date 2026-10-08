#!/usr/bin/env bash
set -euo pipefail

# Real Supabase Auth/Storage/Postgres on the disposable GitHub runner only.
# No cloud project is created, linked, read or written. No repository secrets.
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'AUD_AUTH|ci_runner_required'; exit 1; }
[[ "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || exit 1
for forbidden in SUPABASE_ACCESS_TOKEN FINANCIAL_APP_DB_URL VERCEL_OIDC_TOKEN GOOGLE_SERVICE_ACCOUNT_JSON; do
  [[ -z "${!forbidden:-}" ]] || { echo 'AUD_AUTH|external_credentials_forbidden'; exit 1; }
done
command -v docker >/dev/null
workdir="$(mktemp -d)"
export AUD_ISOLATED_DIR="$workdir"
cleanup() {
  npx --yes supabase@2.120.0 stop --workdir "$workdir" --no-backup >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT

npx --yes supabase@2.120.0 init --workdir "$workdir" >/dev/null
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
npx playwright test --config=playwright.authenticated-isolation.config.ts
npx --yes deno@2.5.4 run --allow-env --allow-net=127.0.0.1,localhost,registry.npmjs.org,jsr.io \
  --allow-read --allow-write="$workdir" \
  --config supabase/functions/financial-app-db-gateway/deno.json \
  supabase/tests/aud_e2e_authenticated.ts verify
echo "AUD_AUTH|status=ok|real_supabase_auth=true|real_storage=true|ocr_persisted=true|cloud_access=false|sha=$AUD_VALIDATION_SHA"
