#!/usr/bin/env bash
set -euo pipefail
umask 077

# The only target is the known disposable CI service. No live DB credentials.
[[ "${GITHUB_ACTIONS:-}" == true ]] || exit 1
[[ "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || exit 1
[[ "$(node -p "require('./package.json').version")" == '10.0.103' ]] || exit 1
AUD_ADMIN='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
[[ "${F13_POSTGRES_ADMIN_URL:-$AUD_ADMIN}" == "$AUD_ADMIN" ]] || exit 1
for forbidden in FINANCIAL_APP_DB_URL FINANCIAL_APP_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN; do
  [[ -z "${!forbidden:-}" ]] || { echo 'AUD_RELEASE_DB|status=failed|reason=external_credentials_forbidden'; exit 1; }
done
export F13_POSTGRES_ADMIN_URL="$AUD_ADMIN"
export EXPECTED_APP_VERSION='10.0.102'
export EXPECTED_SOURCE_COMMIT='0d278a361ba8c0dfef0c116374a21af20782abdb'
private_dir="$PWD/.aud-private-production-backup"
backup_dir="$private_dir/extracted/production-v2-$EXPECTED_SOURCE_COMMIT"
[[ -f "$backup_dir/manifest.json" ]] || exit 1
target_url='postgresql://postgres:postgres@127.0.0.1:5432/financial_app_production_backup_restore_check'
node scripts/render-aud-production-permissions.mjs > "$private_dir/permissions.sql"

# Database errors may contain financial rows. Retain detailed logs only on the
# ephemeral runner and expose predefined phases/codes, never rows or dump files.
if ! bash scripts/restore-verify-production-backup-v2.sh "$backup_dir" > "$private_dir/restore.log" 2>&1; then
  echo 'AUD_RELEASE_DB|status=failed|reason=backup_restore_failed'
  exit 1
fi
if ! psql "$target_url" -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
  -v permissions_sql="$private_dir/permissions.sql" \
  -f supabase/tests/aud_e2e_production_upgrade_rollback.sql > "$private_dir/upgrade.log" 2>&1; then
  node - <<'NODE' "$private_dir/upgrade.log"
const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8');
const stage = [...log.matchAll(/^AUD_RELEASE_STAGE\|phase=(baseline|migrations|financial|documents|rollback|final)$/gm)].at(-1)?.[1] ?? 'setup';
const codes = [...new Set([...log.matchAll(/\bAUD_[A-Z][A-Z0-9_]{3,100}\b/g)].map((match) => match[0]))];
const states = [...new Set([...log.matchAll(/ERROR:\s+([A-Z0-9]{5}):/g)].map((match) => match[1]))];
console.error(JSON.stringify({ status: 'isolated_upgrade_failed', stage, codes, sqlstates: states }));
for (const line of log.split('\n')) if (/^AUD_RELEASE_CATALOG_MISMATCH\|object=financial_app\.[a-z0-9_,(). \[\]]+$/.test(line)) console.error(line);
NODE
  exit 1
fi
node - <<'NODE' "$private_dir/upgrade.log"
const fs = require('node:fs');
const markers = fs.readFileSync(process.argv[2], 'utf8').split('\n')
  .filter((line) => /^AUD_RELEASE_DB\|status=ok\|/.test(line));
if (markers.length !== 1) throw new Error('release_upgrade_success_marker_missing');
console.log(markers[0]);
NODE
echo "AUD_RELEASE_BACKUP|status=ok|real_backup_run=37877870394|restore_upgrade_rollback=true|source_sha=$EXPECTED_SOURCE_COMMIT|candidate_sha=$AUD_VALIDATION_SHA|production_writes=false"
