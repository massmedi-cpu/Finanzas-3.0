#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact backup evidence}"
: "${F13_POSTGRES_ADMIN_URL:=postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

SOURCE_DB="financial_app_f13_v2_source"
TARGET_DB="financial_app_f13_v2_restore"
SOURCE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${SOURCE_DB}"
TARGET_URL="postgresql://postgres:postgres@127.0.0.1:5432/${TARGET_DB}"
BACKUP_DIR="${RUNNER_TEMP:-/tmp}/financial-app-f13-v2-backup"
SYNTHETIC_USER="90000000-0000-4000-8000-000000000013"
PERSONAL_WORKSPACE="00000000-0000-4000-8000-000000000101"

psql_admin() { psql "$F13_POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 "$@"; }
psql_db() { local url="$1"; shift; psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }

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
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), secret text NOT NULL, name text,
  description text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
SELECT id, secret AS decrypted_secret, name, description, created_at, updated_at FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT NULL, new_key_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_id uuid;
BEGIN
  INSERT INTO vault.secrets(secret,name,description) VALUES (new_secret,new_name,new_description) RETURNING id INTO created_id;
  RETURN created_id;
END;
$$;
SQL
}

prepare_restore_target_stubs() {
  local url="$1"
  prepare_managed_stubs "$url"
  psql_db "$url" <<'SQL'
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'financial_app_gateway') THEN
    CREATE ROLE financial_app_gateway NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;
SQL
}

seed_user_before_tenancy() {
  local url="$1"
  psql_db "$url" -v synthetic_user="$SYNTHETIC_USER" <<'SQL'
INSERT INTO auth.users(id) VALUES (:'synthetic_user'::uuid) ON CONFLICT (id) DO NOTHING;
INSERT INTO financial_app.authorized_users(user_id,active)
VALUES (:'synthetic_user'::uuid,true)
ON CONFLICT (user_id) DO UPDATE SET active=true,updated_at=now();
SQL
}

rm -rf "$BACKUP_DIR"
psql_admin -c "DROP DATABASE IF EXISTS ${SOURCE_DB};"
psql_admin -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql_admin -c "CREATE DATABASE ${SOURCE_DB};"
psql_admin -c "CREATE DATABASE ${TARGET_DB};"
prepare_managed_stubs "$SOURCE_URL"

migration_count=0
seeded=0
while IFS= read -r migration; do
  base="$(basename "$migration")"
  if [[ "$base" == *"_pre001_workspace_tenancy.sql" && "$seeded" == "0" ]]; then
    seed_user_before_tenancy "$SOURCE_URL"
    seeded=1
  fi
  echo "F13_V2_RESTORE|migration=${base}"
  psql_db "$SOURCE_URL" -f "$migration" >/dev/null
  migration_count=$((migration_count + 1))
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

if [[ "$migration_count" -lt 1 || "$seeded" != "1" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=latest_tenancy_migrations_not_applied"
  exit 1
fi

workspace_count="$(psql_db "$SOURCE_URL" -Atc "select count(*) from financial_app.workspaces where id='${PERSONAL_WORKSPACE}'::uuid")"
membership_count="$(psql_db "$SOURCE_URL" -Atc "select count(*) from financial_app.workspace_memberships where workspace_id='${PERSONAL_WORKSPACE}'::uuid and user_id='${SYNTHETIC_USER}'::uuid and role='owner' and active=true and is_default=true")"
if [[ "$workspace_count" != "1" || "$membership_count" != "1" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=tenancy_seed_failed|workspace=${workspace_count}|membership=${membership_count}"
  exit 1
fi

psql_db "$SOURCE_URL" -v ws="$PERSONAL_WORKSPACE" <<'SQL'
INSERT INTO financial_app.accounts(
  id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) VALUES (
  '10000000-0000-4000-8000-000000000013',:'ws'::uuid,'F13 V2 Restore Rehearsal','Synthetic','checking',0,'EUR','active',0
);
INSERT INTO financial_app.transaction_source_records(
  id,workspace_id,source_file_id,source_sheet_id,source_row_key,source_fingerprint,
  source_payload,bank_date,concept_original,amount_cents,balance_after_cents,
  account_external_key,source_row_identity
) VALUES (
  '11000000-0000-4000-8000-000000000013',:'ws'::uuid,'f13-v2-synthetic-source','sheet-f13-v2','F13V2-0001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"synthetic":true,"phase":"13-v2"}'::jsonb,
  DATE '2026-09-10','Ensayo de restauracion F13 v2',-12345,987655,'synthetic-f13-v2','f13-v2-row-0001'
);
INSERT INTO financial_app.transactions(
  id,workspace_id,source_record_id,account_id,bank_date,concept_normalized,
  merchant_id,category_id,kind,amount_cents,balance_after_cents,
  review_state,duplicate_state,transfer_pair_id,source_row_identity
) VALUES (
  '12000000-0000-4000-8000-000000000013',:'ws'::uuid,'11000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000013',DATE '2026-09-10','ensayo de restauracion f13 v2',
  NULL,NULL,'expense',-12345,987655,'confirmed','none',NULL,'f13-v2-row-0001'
);
INSERT INTO financial_app.transaction_overrides(
  id,workspace_id,transaction_id,concept_override,excluded_from_analytics,note
) VALUES (
  '13000000-0000-4000-8000-000000000013',:'ws'::uuid,'12000000-0000-4000-8000-000000000013',
  'Ensayo F13 v2 restaurado',false,'synthetic restore rehearsal v2'
);
SQL

schema_version="$(psql_db "$SOURCE_URL" -Atc "select schema_version from financial_app.schema_meta where id=true")"
export FINANCIAL_APP_DB_URL="$SOURCE_URL"
export FINANCIAL_APP_SOURCE_COMMIT="$GITHUB_SHA"
unset FINANCIAL_APP_STORAGE_ARCHIVE || true

node scripts/create-financial-backup-v2.mjs "$BACKUP_DIR"
node scripts/validate-financial-backup-v2.mjs "$BACKUP_DIR"

prepare_restore_target_stubs "$TARGET_URL"
psql_db "$TARGET_URL" --single-transaction -f "$BACKUP_DIR/schema.sql" -f "$BACKUP_DIR/data.sql" >/dev/null

restored="$(psql_db "$TARGET_URL" -At <<SQL
WITH checks AS (
  SELECT
    (SELECT count(*) FROM financial_app.workspaces WHERE id='${PERSONAL_WORKSPACE}'::uuid) AS workspaces,
    (SELECT count(*) FROM financial_app.accounts WHERE id='10000000-0000-4000-8000-000000000013'::uuid) AS accounts,
    (SELECT count(*) FROM financial_app.transaction_source_records WHERE id='11000000-0000-4000-8000-000000000013'::uuid) AS source_records,
    (SELECT count(*) FROM financial_app.transactions WHERE id='12000000-0000-4000-8000-000000000013'::uuid) AS transactions,
    (SELECT count(*) FROM financial_app.transaction_overrides WHERE id='13000000-0000-4000-8000-000000000013'::uuid) AS overrides,
    (SELECT count(*) FROM financial_app.workspace_memberships) AS memberships,
    (SELECT count(*) FROM financial_app.authorized_users) AS authorized_rows,
    (SELECT count(*) FROM financial_app.google_oauth_connections) AS oauth_rows,
    (SELECT count(*) FROM financial_app.workspace_deletion_intents) AS deletion_intents,
    (SELECT count(*) FROM financial_app.workspace_deletion_runtime_policy) AS deletion_policy_rows,
    (SELECT count(*) FROM financial_app.transactions t LEFT JOIN financial_app.transaction_source_records s ON s.id=t.source_record_id AND s.workspace_id=t.workspace_id WHERE s.id IS NULL) AS orphan_sources,
    (SELECT count(*) FROM financial_app.transactions t LEFT JOIN financial_app.accounts a ON a.id=t.account_id AND a.workspace_id=t.workspace_id WHERE a.id IS NULL) AS orphan_accounts,
    (SELECT bank_source_policy FROM financial_app.schema_meta WHERE id=true) AS bank_source_policy
)
SELECT concat_ws('|',workspaces,accounts,source_records,transactions,overrides,memberships,authorized_rows,oauth_rows,deletion_intents,deletion_policy_rows,orphan_sources,orphan_accounts,bank_source_policy)
FROM checks;
SQL
)"
IFS='|' read -r workspaces accounts source_records transactions overrides memberships authorized_rows oauth_rows deletion_intents deletion_policy_rows orphan_sources orphan_accounts bank_policy <<< "$restored"

if [[ "$workspaces" != "1" || "$accounts" != "1" || "$source_records" != "1" || "$transactions" != "1" || "$overrides" != "1" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=missing_restored_rows|evidence=${restored}"
  exit 1
fi
if [[ "$memberships" != "0" || "$authorized_rows" != "0" || "$oauth_rows" != "0" || "$deletion_intents" != "0" || "$deletion_policy_rows" != "0" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=runtime_control_rows_restored|evidence=${restored}"
  exit 1
fi
if [[ "$orphan_sources" != "0" || "$orphan_accounts" != "0" || "$bank_policy" != "read_only" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=integrity_or_bank_policy|evidence=${restored}"
  exit 1
fi

# Reaprovisionar acceso es una acción separada del restore y no reactiva borrado.
seed_user_before_tenancy "$TARGET_URL"
psql_db "$TARGET_URL" -v ws="$PERSONAL_WORKSPACE" -v synthetic_user="$SYNTHETIC_USER" <<'SQL'
INSERT INTO financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default)
VALUES (:'ws'::uuid,:'synthetic_user'::uuid,'owner',true,true)
ON CONFLICT (workspace_id,user_id) DO UPDATE
SET role='owner',active=true,is_default=true,updated_at=now();
SQL

post_membership="$(psql_db "$TARGET_URL" -Atc "select count(*) from financial_app.workspace_memberships where workspace_id='${PERSONAL_WORKSPACE}'::uuid and user_id='${SYNTHETIC_USER}'::uuid and role='owner' and active=true and is_default=true")"
post_policy="$(psql_db "$TARGET_URL" -Atc "select count(*) from financial_app.workspace_deletion_runtime_policy")"
if [[ "$post_membership" != "1" || "$post_policy" != "0" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=reprovision_or_deletion_fail_closed|membership=${post_membership}|policy_rows=${post_policy}"
  exit 1
fi

manifest_sha="$(node -e "const m=require(process.argv[1]);process.stdout.write(m.sourceCommit)" "$BACKUP_DIR/manifest.json")"
if [[ "$manifest_sha" != "$GITHUB_SHA" ]]; then
  echo "F13_V2_RESTORE|status=failed|reason=manifest_sha_mismatch|manifest=${manifest_sha}|expected=${GITHUB_SHA}"
  exit 1
fi

echo "F13_V2_RESTORE|status=ok|migrations=${migration_count}|schema_version=${schema_version}|workspace=1|accounts=1|source_records=1|transactions=1|overrides=1|pre_restore_memberships=0|post_reprovision_membership=1|deletion_policy_rows=0|bank_source_policy=${bank_policy}|sha=${manifest_sha}"
