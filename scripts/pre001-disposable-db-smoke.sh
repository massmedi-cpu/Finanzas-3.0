#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact PRE-001 evidence}"
: "${PRE001_POSTGRES_ADMIN_URL:=postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

DB_NAME="financial_app_pre001_disposable"
DB_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}"
PRE001_FIRST="20260909185000_pre001_workspace_tenancy.sql"
PRE001_MIGRATIONS=(
  "supabase/migrations/20260909185000_pre001_workspace_tenancy.sql"
  "supabase/migrations/20260909193000_pre001_workspace_isolation.sql"
  "supabase/migrations/20260909194500_pre001_workspace_fk_semantics.sql"
  "supabase/migrations/20260909200000_pre001_function_surface_lockdown.sql"
)
PERSONAL_USER_ID="80000000-0000-4000-8000-000000000001"
PERSONAL_WORKSPACE_ID="00000000-0000-4000-8000-000000000101"
BASE_ACCOUNT_ID="80100000-0000-4000-8000-000000000011"
BASE_SOURCE_ID="80200000-0000-4000-8000-000000000012"
BASE_TRANSACTION_ID="80300000-0000-4000-8000-000000000013"

psql_admin() {
  psql "$PRE001_POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

prepare_managed_stubs() {
  psql_db <<'SQL'
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

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

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

psql_admin -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql_admin -c "CREATE DATABASE ${DB_NAME};"
prepare_managed_stubs

pre_migration_count=0
while IFS= read -r migration; do
  base="$(basename "$migration")"
  if [[ "$base" == "$PRE001_FIRST" ]]; then
    break
  fi
  echo "PRE001_DB|baseline_migration=${base}"
  psql_db -f "$migration" >/dev/null
  pre_migration_count=$((pre_migration_count + 1))
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

if [ "$pre_migration_count" -lt 1 ]; then
  echo "PRE001_DB|status=failed|reason=no_baseline_migrations"
  exit 1
fi

# Seed a tiny personal baseline before PRE-001 so the migration must perform a real
# workspace backfill and preserve existing relationships.
psql_db <<SQL
INSERT INTO auth.users(id)
VALUES ('${PERSONAL_USER_ID}'::uuid);

INSERT INTO financial_app.authorized_users(user_id, active)
VALUES ('${PERSONAL_USER_ID}'::uuid, true);

INSERT INTO financial_app.accounts(
  id, name, institution, type, opening_balance_cents, currency, lifecycle, sort_order
) VALUES (
  '${BASE_ACCOUNT_ID}'::uuid,
  'PRE001 baseline account',
  'Synthetic',
  'checking',
  100000,
  'EUR',
  'active',
  0
);

INSERT INTO financial_app.transaction_source_records(
  id, source_file_id, source_sheet_id, source_row_key, source_fingerprint,
  source_payload, bank_date, concept_original, amount_cents, balance_after_cents,
  account_external_key, source_row_identity
) VALUES (
  '${BASE_SOURCE_ID}'::uuid,
  'pre001-baseline-source',
  'sheet-pre001',
  'PRE001-BASE-0001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '{"synthetic":true,"gate":"PRE-001"}'::jsonb,
  DATE '2026-09-09',
  'PRE001 baseline movement',
  -2500,
  97500,
  'pre001-baseline-account',
  'pre001-baseline-row-0001'
);

INSERT INTO financial_app.transactions(
  id, source_record_id, account_id, bank_date, concept_normalized,
  merchant_id, category_id, kind, amount_cents, balance_after_cents,
  review_state, duplicate_state, transfer_pair_id, source_row_identity
) VALUES (
  '${BASE_TRANSACTION_ID}'::uuid,
  '${BASE_SOURCE_ID}'::uuid,
  '${BASE_ACCOUNT_ID}'::uuid,
  DATE '2026-09-09',
  'pre001 baseline movement',
  NULL,
  NULL,
  'expense',
  -2500,
  97500,
  'confirmed',
  'none',
  NULL,
  'pre001-baseline-row-0001'
);
SQL

for migration in "${PRE001_MIGRATIONS[@]}"; do
  if [ ! -f "$migration" ]; then
    echo "PRE001_DB|status=failed|reason=missing_pre001_migration|file=${migration}"
    exit 1
  fi
  echo "PRE001_DB|pre001_migration=$(basename "$migration")"
  psql_db -f "$migration" >/dev/null
done

backfill_evidence="$(psql_db -At <<SQL
SELECT concat_ws('|',
  (SELECT count(*) FROM financial_app.workspaces WHERE id='${PERSONAL_WORKSPACE_ID}'::uuid),
  (SELECT count(*) FROM financial_app.workspace_memberships
     WHERE workspace_id='${PERSONAL_WORKSPACE_ID}'::uuid
       AND user_id='${PERSONAL_USER_ID}'::uuid
       AND role='owner' AND active=true AND is_default=true),
  (SELECT count(*) FROM financial_app.accounts
     WHERE id='${BASE_ACCOUNT_ID}'::uuid AND workspace_id='${PERSONAL_WORKSPACE_ID}'::uuid),
  (SELECT count(*) FROM financial_app.transaction_source_records
     WHERE id='${BASE_SOURCE_ID}'::uuid AND workspace_id='${PERSONAL_WORKSPACE_ID}'::uuid),
  (SELECT count(*) FROM financial_app.transactions
     WHERE id='${BASE_TRANSACTION_ID}'::uuid AND workspace_id='${PERSONAL_WORKSPACE_ID}'::uuid)
);
SQL
)"

if [ "$backfill_evidence" != "1|1|1|1|1" ]; then
  echo "PRE001_DB|status=failed|reason=personal_backfill|evidence=${backfill_evidence}"
  exit 1
fi

smoke_output="$(psql_db -f scripts/pre001-cross-tenant-smoke.sql)"
printf '%s\n' "$smoke_output"
if ! grep -q "PRE001_CROSS_TENANT_SMOKE_OK" <<<"$smoke_output"; then
  echo "PRE001_DB|status=failed|reason=smoke_marker_missing"
  exit 1
fi

rollback_evidence="$(psql_db -At <<SQL
SELECT concat_ws('|',
  (SELECT count(*) FROM financial_app.workspaces),
  (SELECT count(*) FROM financial_app.workspaces
     WHERE id IN ('91000000-0000-4000-8000-000000000001'::uuid,'92000000-0000-4000-8000-000000000002'::uuid)),
  (SELECT count(*) FROM financial_app.accounts
     WHERE id IN ('91100000-0000-4000-8000-000000000011'::uuid,'92100000-0000-4000-8000-000000000021'::uuid)),
  (SELECT count(*) FROM financial_app.categories
     WHERE id IN ('91200000-0000-4000-8000-000000000012'::uuid,'92200000-0000-4000-8000-000000000022'::uuid))
);
SQL
)"

if [ "$rollback_evidence" != "1|0|0|0" ]; then
  echo "PRE001_DB|status=failed|reason=smoke_left_residue|evidence=${rollback_evidence}"
  exit 1
fi

echo "PRE001_DB|status=ok|baseline_migrations=${pre_migration_count}|pre001_migrations=4|backfill=${backfill_evidence}|rollback=${rollback_evidence}|sha=${GITHUB_SHA}"
