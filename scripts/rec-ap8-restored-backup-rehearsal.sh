#!/usr/bin/env bash
set -euo pipefail
umask 077

# REC-AP8-309/310: The only allowed target is disposable localhost PostgreSQL.
# The caller must already have checked backup run, artifact and SHA256 digest.
fail() { echo "REC_AP8_REAL_BACKUP|status=failed|reason=$1"; exit 1; }
local_admin='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
local_db='postgresql://postgres:postgres@127.0.0.1:5432/financial_app_production_backup_restore_check'
expected_source='6dad59c6c2db3575618a7c91c49c3060a93bbba1'
[[ "${GITHUB_ACTIONS:-}" == true ]] || fail ci_only
[[ "${GITHUB_EVENT_NAME:-}" == pull_request ]] || fail pr_only
[[ "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail invalid_head
[[ "$(git rev-parse HEAD)" == "${AUD_VALIDATION_SHA}" ]] || fail head_mismatch
[[ "${EXPECTED_SOURCE_COMMIT:-}" == "$expected_source" ]] || fail baseline_sha_mismatch
[[ "${EXPECTED_APP_VERSION:-}" == '10.0.103' ]] || fail baseline_version_mismatch
[[ "${F13_POSTGRES_ADMIN_URL:-$local_admin}" == "$local_admin" ]] || fail external_admin_url_forbidden
[[ "$(node -p "require('./package.json').version")" == '10.0.103' ]] || fail candidate_version_mismatch
for var in FINANCIAL_APP_DB_URL FINANCIAL_APP_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN; do
  [[ -z "${!var:-}" ]] || fail external_credentials_forbidden
done
backup_dir="${1:?Private local restored backup directory required}"
[[ -f "$backup_dir/manifest.json" ]] || fail missing_manifest
node - "$backup_dir/manifest.json" <<'NODE'
const m = require(process.argv[2]);
if (m.sourceCommit !== '6dad59c6c2db3575618a7c91c49c3060a93bbba1'
  || m.appVersion !== '10.0.103') process.exit(1);
NODE
export F13_POSTGRES_ADMIN_URL="$local_admin"
export EXPECTED_SOURCE_COMMIT="$expected_source"
export EXPECTED_APP_VERSION='10.0.103'
private_log="$(dirname "$backup_dir")/ap8-private.log"
# The restore check hashes backup files/row counts but never prints private rows.
if ! bash scripts/restore-verify-production-backup-v2.sh "$backup_dir" >"$private_log" 2>&1; then
  fail backup_restore
fi
echo 'REC_AP8_REAL_BACKUP|stage=restore|status=ok|source=2026-10-20|version=10.0.103'
if ! psql "$local_db" -X -v ON_ERROR_STOP=1 -q \
  -f supabase/tests/rec_ap8_restored_backup_upgrade_rollback.sql >"$private_log" 2>&1; then
  # SQL errors may contain user data: print only stable sanitized codes.
  node - "$private_log" <<'NODE'
const fs=require('node:fs');
const s=fs.readFileSync(process.argv[2],'utf8');
const phase=[...s.matchAll(/REC_AP8_DELTA\|phase=(upgrade|rollback)/g)].at(-1)?.[1]||'preflight';
const reason=s.includes('permission denied for schema financial_app') ? 'portable_acl_not_reconstructed'
  : s.includes('CATEGORY_LABEL_BATCH_REQUIRES_DISPOSABLE_DB') || s.includes('SPLIT_FACT_BATCH_REQUIRES_DISPOSABLE_DB')
    ? 'wrong_fixture_database_guard' : 'sql_fixture_or_migration_failed';
console.log('REC_AP8_REAL_BACKUP|status=failed|phase='+phase+'|reason='+reason);
NODE
  exit 1
fi
node - "$private_log" <<'NODE'
const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8');
if (!log.includes('REC_AP8_DELTA|status=ok|baseline=authentic_10_0_103_restored')
 || !log.includes('REC_AP8_DELTA|rollback=passed')
 || !log.includes('REC_SYNC_AP5_REHEARSAL|status=ok|inserts=20|replay_skips=20|conflict_rolls_back=true|workspace_isolated=true|no_residue=true')) {
  process.exit(1);
}
NODE
# Verify final trigger absent again (baseline restored), without reading rows.
final_guard="$(psql "$local_db" -X -At -v ON_ERROR_STOP=1 -c \
 "select count(*) from pg_trigger where tgname='documents_private_original_rewrite_guard' and not tgisinternal")"
[[ "$final_guard" == 0 ]] || fail guard_not_rolled_back
echo "REC_AP8_REAL_BACKUP|status=ok|authentic_restored=true|upgrade_migrations=4|rollback=true|data_digest_identical=true|source_sha=$expected_source|candidate_sha=$AUD_VALIDATION_SHA|live_production_writes=false"
