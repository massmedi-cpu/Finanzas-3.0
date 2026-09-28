#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:?backup directory is required}"
: "${F13_POSTGRES_ADMIN_URL:=postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
TARGET_DB="financial_app_production_backup_restore_check"
TARGET_URL="postgresql://postgres:postgres@127.0.0.1:5432/${TARGET_DB}"

psql_admin() { psql "$F13_POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 "$@"; }
psql_db() { local url="$1"; shift; psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }

for required in schema.sql data.sql manifest.json storage-inventory.json; do
  if [[ ! -f "$BACKUP_DIR/$required" ]]; then
    echo "PRODUCTION_BACKUP_RESTORE|status=failed|reason=missing_${required//./_}"
    exit 1
  fi
done

node scripts/validate-financial-backup-v2.mjs "$BACKUP_DIR"

psql_admin -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql_admin -c "CREATE DATABASE ${TARGET_DB};"

psql_db "$TARGET_URL" <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'financial_app_gateway') THEN
    CREATE ROLE financial_app_gateway NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
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

psql_db "$TARGET_URL" --single-transaction -f "$BACKUP_DIR/schema.sql" -f "$BACKUP_DIR/data.sql" >/dev/null

restored="$(psql_db "$TARGET_URL" -At <<'SQL'
WITH checks AS (
  SELECT
    (SELECT count(*) FROM financial_app.schema_meta WHERE id=true) AS schema_meta_rows,
    (SELECT schema_version FROM financial_app.schema_meta WHERE id=true) AS schema_version,
    (SELECT bank_source_policy FROM financial_app.schema_meta WHERE id=true) AS bank_source_policy,
    (SELECT count(*) FROM financial_app.workspaces) AS workspaces,
    (SELECT count(*) FROM financial_app.accounts) AS accounts,
    (SELECT count(*) FROM financial_app.transaction_source_records) AS source_records,
    (SELECT count(*) FROM financial_app.transactions) AS transactions,
    (SELECT count(*) FROM financial_app.workspace_memberships) AS memberships,
    (SELECT count(*) FROM financial_app.authorized_users) AS authorized_rows,
    (SELECT count(*) FROM financial_app.google_oauth_connections) AS oauth_rows,
    (SELECT count(*) FROM financial_app.workspace_deletion_intents) AS deletion_intents,
    (SELECT count(*) FROM financial_app.workspace_deletion_runtime_policy) AS deletion_policy_rows,
    (SELECT count(*) FROM financial_app.transactions t
      LEFT JOIN financial_app.transaction_source_records s
        ON s.id=t.source_record_id AND s.workspace_id=t.workspace_id
      WHERE t.source_record_id IS NOT NULL AND s.id IS NULL) AS orphan_sources,
    (SELECT count(*) FROM financial_app.transactions t
      LEFT JOIN financial_app.accounts a
        ON a.id=t.account_id AND a.workspace_id=t.workspace_id
      WHERE t.account_id IS NOT NULL AND a.id IS NULL) AS orphan_accounts
)
SELECT concat_ws('|',schema_meta_rows,schema_version,bank_source_policy,workspaces,accounts,source_records,transactions,memberships,authorized_rows,oauth_rows,deletion_intents,deletion_policy_rows,orphan_sources,orphan_accounts)
FROM checks;
SQL
)"

IFS='|' read -r schema_meta_rows schema_version bank_policy workspaces accounts source_records transactions memberships authorized_rows oauth_rows deletion_intents deletion_policy_rows orphan_sources orphan_accounts <<< "$restored"

if [[ "$schema_meta_rows" != "1" || ! "$schema_version" =~ ^[0-9]+$ || "$bank_policy" != "read_only" ]]; then
  echo "PRODUCTION_BACKUP_RESTORE|status=failed|reason=schema_or_bank_policy"
  exit 1
fi
if [[ "$memberships" != "0" || "$authorized_rows" != "0" || "$oauth_rows" != "0" || "$deletion_intents" != "0" || "$deletion_policy_rows" != "0" ]]; then
  echo "PRODUCTION_BACKUP_RESTORE|status=failed|reason=runtime_control_rows_restored"
  exit 1
fi
if [[ "$orphan_sources" != "0" || "$orphan_accounts" != "0" ]]; then
  echo "PRODUCTION_BACKUP_RESTORE|status=failed|reason=financial_integrity_orphans"
  exit 1
fi

manifest_version="$(node -e "const m=require(process.argv[1]);process.stdout.write(String(m.appVersion))" "$BACKUP_DIR/manifest.json")"
manifest_sha="$(node -e "const m=require(process.argv[1]);process.stdout.write(String(m.sourceCommit))" "$BACKUP_DIR/manifest.json")"
if [[ "$manifest_version" != "10.0.34" || "$manifest_sha" != "00e7879decdab3a62b6b8e325b4f04b2004bfe96" ]]; then
  echo "PRODUCTION_BACKUP_RESTORE|status=failed|reason=stable_identity_mismatch"
  exit 1
fi

echo "PRODUCTION_BACKUP_RESTORE|status=ok|app_version=${manifest_version}|schema_version=${schema_version}|workspaces=${workspaces}|accounts=${accounts}|source_records=${source_records}|transactions=${transactions}|runtime_controls=0|orphans=0|bank_source_policy=${bank_policy}|sha=${manifest_sha}"
