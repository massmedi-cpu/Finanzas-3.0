#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact backup evidence}"
: "${F13_POSTGRES_ADMIN_URL:=postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

SOURCE_DB="financial_app_f13_source"
TARGET_DB="financial_app_f13_restore"
SOURCE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${SOURCE_DB}"
TARGET_URL="postgresql://postgres:postgres@127.0.0.1:5432/${TARGET_DB}"
BACKUP_DIR="${RUNNER_TEMP:-/tmp}/financial-app-f13-backup"

psql_admin() {
  psql "$F13_POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  local url="$1"
  shift
  psql "$url" -X -v ON_ERROR_STOP=1 "$@"
}

prepare_managed_stubs() {
  local url="$1"
  psql_db "$url" <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$ SELECT '{}'::jsonb $$;

CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret text NOT NULL,
  name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
SELECT id, secret AS decrypted_secret, name, description, created_at, updated_at
FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text,
  new_name text DEFAULT NULL,
  new_description text DEFAULT NULL,
  new_key_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_id uuid;
BEGIN
  INSERT INTO vault.secrets(secret, name, description)
  VALUES (new_secret, new_name, new_description)
  RETURNING id INTO created_id;
  RETURN created_id;
END;
$$;
SQL
}

rm -rf "$BACKUP_DIR"

psql_admin -c "DROP DATABASE IF EXISTS ${SOURCE_DB};"
psql_admin -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql_admin -c "CREATE DATABASE ${SOURCE_DB};"
psql_admin -c "CREATE DATABASE ${TARGET_DB};"

prepare_managed_stubs "$SOURCE_URL"

migration_count=0
while IFS= read -r migration; do
  echo "F13_RESTORE|migration=$(basename "$migration")"
  psql_db "$SOURCE_URL" -f "$migration" >/dev/null
  migration_count=$((migration_count + 1))
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

if [ "$migration_count" -lt 1 ]; then
  echo "F13_RESTORE|status=failed|reason=no_migrations"
  exit 1
fi

psql_db "$SOURCE_URL" <<'SQL'
INSERT INTO financial_app.accounts(
  id, name, institution, type, opening_balance_cents, currency, lifecycle, sort_order
) VALUES (
  '10000000-0000-4000-8000-000000000013',
  'F13 Restore Rehearsal',
  'Synthetic',
  'checking',
  0,
  'EUR',
  'active',
  0
);

INSERT INTO financial_app.transaction_source_records(
  id, source_file_id, source_sheet_id, source_row_key, source_fingerprint,
  source_payload, bank_date, concept_original, amount_cents, balance_after_cents,
  account_external_key, source_row_identity
) VALUES (
  '11000000-0000-4000-8000-000000000013',
  'f13-synthetic-source',
  'sheet-f13',
  'F13-0001',
  'f13-synthetic-fingerprint-0001',
  '{"synthetic":true,"phase":13}'::jsonb,
  DATE '2026-09-07',
  'Ensayo de restauracion F13',
  -12345,
  987655,
  'synthetic-f13',
  'f13-row-0001'
);

INSERT INTO financial_app.transactions(
  id, source_record_id, account_id, bank_date, concept_normalized,
  merchant_id, category_id, kind, amount_cents, balance_after_cents,
  review_state, duplicate_state, transfer_pair_id, source_row_identity
) VALUES (
  '12000000-0000-4000-8000-000000000013',
  '11000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000013',
  DATE '2026-09-07',
  'ensayo de restauracion f13',
  NULL,
  NULL,
  'expense',
  -12345,
  987655,
  'confirmed',
  'none',
  NULL,
  'f13-row-0001'
);

INSERT INTO financial_app.transaction_overrides(
  id, transaction_id, concept_override, excluded_from_analytics, note
) VALUES (
  '13000000-0000-4000-8000-000000000013',
  '12000000-0000-4000-8000-000000000013',
  'Ensayo F13 restaurado',
  false,
  'synthetic restore rehearsal'
);
SQL

schema_version="$(psql_db "$SOURCE_URL" -Atc "select schema_version from financial_app.schema_meta where id=true")"
if ! [[ "$schema_version" =~ ^[1-9][0-9]*$ ]]; then
  echo "F13_RESTORE|status=failed|reason=invalid_schema_version|value=${schema_version}"
  exit 1
fi

export FINANCIAL_APP_DB_URL="$SOURCE_URL"
export FINANCIAL_APP_SOURCE_COMMIT="$GITHUB_SHA"
export FINANCIAL_APP_SCHEMA_VERSION="$schema_version"
export FINANCIAL_APP_STORAGE_BUCKET_COUNT=0
export FINANCIAL_APP_STORAGE_OBJECT_COUNT=0

node scripts/create-financial-backup.mjs "$BACKUP_DIR"
node scripts/validate-financial-backup.mjs "$BACKUP_DIR"

prepare_managed_stubs "$TARGET_URL"
psql_db "$TARGET_URL" --single-transaction -f "$BACKUP_DIR/schema.sql" -f "$BACKUP_DIR/data.sql" >/dev/null

restored="$(psql_db "$TARGET_URL" -At <<'SQL'
WITH checks AS (
  SELECT
    (SELECT count(*) FROM financial_app.accounts WHERE id='10000000-0000-4000-8000-000000000013'::uuid) AS accounts,
    (SELECT count(*) FROM financial_app.transaction_source_records WHERE id='11000000-0000-4000-8000-000000000013'::uuid) AS source_records,
    (SELECT count(*) FROM financial_app.transactions WHERE id='12000000-0000-4000-8000-000000000013'::uuid) AS transactions,
    (SELECT count(*) FROM financial_app.transaction_overrides WHERE id='13000000-0000-4000-8000-000000000013'::uuid) AS overrides,
    (SELECT count(*) FROM financial_app.transactions t LEFT JOIN financial_app.transaction_source_records s ON s.id=t.source_record_id WHERE s.id IS NULL) AS orphan_sources,
    (SELECT count(*) FROM financial_app.transactions t LEFT JOIN financial_app.accounts a ON a.id=t.account_id WHERE a.id IS NULL) AS orphan_accounts,
    (SELECT count(*) FROM financial_app.transaction_overrides o LEFT JOIN financial_app.transactions t ON t.id=o.transaction_id WHERE t.id IS NULL) AS orphan_overrides,
    (SELECT count(*) FROM financial_app.google_oauth_connections) AS oauth_rows,
    (SELECT count(*) FROM financial_app.authorized_users) AS authorized_rows,
    (SELECT bank_source_policy FROM financial_app.schema_meta WHERE id=true) AS bank_source_policy
)
SELECT concat_ws('|', accounts, source_records, transactions, overrides, orphan_sources, orphan_accounts, orphan_overrides, oauth_rows, authorized_rows, bank_source_policy)
FROM checks;
SQL
)"

IFS='|' read -r accounts source_records transactions overrides orphan_sources orphan_accounts orphan_overrides oauth_rows authorized_rows bank_policy <<< "$restored"

if [ "$accounts" != "1" ] || [ "$source_records" != "1" ] || [ "$transactions" != "1" ] || [ "$overrides" != "1" ]; then
  echo "F13_RESTORE|status=failed|reason=missing_restored_rows|evidence=${restored}"
  exit 1
fi
if [ "$orphan_sources" != "0" ] || [ "$orphan_accounts" != "0" ] || [ "$orphan_overrides" != "0" ]; then
  echo "F13_RESTORE|status=failed|reason=referential_integrity|evidence=${restored}"
  exit 1
fi
if [ "$oauth_rows" != "0" ] || [ "$authorized_rows" != "0" ]; then
  echo "F13_RESTORE|status=failed|reason=sensitive_rows_restored|evidence=${restored}"
  exit 1
fi
if [ "$bank_policy" != "read_only" ]; then
  echo "F13_RESTORE|status=failed|reason=bank_policy_changed|evidence=${restored}"
  exit 1
fi

manifest_sha="$(node -e "const m=require(process.argv[1]);process.stdout.write(m.sourceCommit)" "$BACKUP_DIR/manifest.json")"
if [ "$manifest_sha" != "$GITHUB_SHA" ]; then
  echo "F13_RESTORE|status=failed|reason=manifest_sha_mismatch|manifest=${manifest_sha}|expected=${GITHUB_SHA}"
  exit 1
fi

echo "F13_RESTORE|status=ok|migrations=${migration_count}|schema_version=${schema_version}|accounts=${accounts}|source_records=${source_records}|transactions=${transactions}|overrides=${overrides}|orphans=0|sensitive_rows=0|bank_source_policy=${bank_policy}|sha=${manifest_sha}"
