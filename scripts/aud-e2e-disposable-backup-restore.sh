#!/usr/bin/env bash
set -euo pipefail

# AUD-E2E-VAL-001: rehearse the real backup-v2 creation, validation and
# restore verifier with the existing SYNTHETIC, disposable CI database.
# Never accept an external Postgres URL, Supabase service or real documents.
local_admin='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
local_db='postgresql://postgres:postgres@127.0.0.1:5432/financial_app_pre001_disposable'
restore_db='financial_app_production_backup_restore_check'

fail() {
  echo "AUD_E2E_BACKUP|status=failed|reason=$1"
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == 'true' ]] || fail 'ci_runner_required'
[[ "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid_sha'
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || fail 'checkout_sha_mismatch'
[[ "${DB_URL:-}" == "$local_db" ]] || fail 'disposable_database_required'
[[ "${PRE001_POSTGRES_ADMIN_URL:-}" == "$local_admin" ]] || fail 'local_admin_required'
[[ -z "${FINANCIAL_APP_STORAGE_ARCHIVE:-}" ]] || fail 'external_storage_archive_forbidden'
[[ "$(pg_dump --version)" == *' 17.'* ]] || fail 'postgres_17_dump_required'

workdir="$(mktemp -d)"
cleanup() {
  psql "$local_admin" -X -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$restore_db' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql "$local_admin" -X -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $restore_db;" >/dev/null 2>&1 || true
  rm -rf -- "$workdir"
}
trap cleanup EXIT

# Supabase Storage is a stub in this disposable database. This additional
# empty table is needed only to exercise the actual backup-v2 inventory path.
psql "$local_db" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
SQL

objects="$(psql "$local_db" -X -At -v ON_ERROR_STOP=1 -c 'select count(*) from storage.objects')"
[[ "$objects" == '0' ]] || fail 'unexpected_storage_objects'

export FINANCIAL_APP_DB_URL="$local_db"
export FINANCIAL_APP_SOURCE_COMMIT="$AUD_VALIDATION_SHA"
export EXPECTED_SOURCE_COMMIT="$AUD_VALIDATION_SHA"
export EXPECTED_APP_VERSION
EXPECTED_APP_VERSION="$(node -p "require('./package.json').version")"
export F13_POSTGRES_ADMIN_URL="$local_admin"

node scripts/create-financial-backup-v2.mjs "$workdir/backup"
node scripts/validate-financial-backup-v2.mjs "$workdir/backup"
bash scripts/restore-verify-production-backup-v2.sh "$workdir/backup"
echo "AUD_E2E_BACKUP|status=ok|synthetic_only=true|backup_validated=true|restore_verified=true|sha=$AUD_VALIDATION_SHA"
