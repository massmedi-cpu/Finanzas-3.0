#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact PRE-020 evidence}"

# Reutiliza íntegramente el preparador/gate PRE-001. Al ejecutarse mediante source,
# su trap de cleanup queda activo hasta que este script termine, por lo que la DB
# desechable sigue disponible sólo para aplicar PRE-020 y se elimina al salir.
source scripts/pre001-disposable-db-smoke.sh

PRE020_MIGRATION="supabase/migrations/20260909213000_pre020_workspace_structured_export.sql"

if [ ! -f "$PRE020_MIGRATION" ]; then
  echo "PRE020_DB|status=failed|reason=missing_pre020_migration|file=${PRE020_MIGRATION}"
  exit 1
fi

echo "PRE020_DB|migration=$(basename "$PRE020_MIGRATION")"
psql_db -f "$PRE020_MIGRATION" >/dev/null

smoke_output="$(psql_db -f scripts/pre020-export-cross-tenant-smoke.sql)"
printf '%s\n' "$smoke_output"

if ! grep -q "PRE020_STRUCTURED_EXPORT_SMOKE_OK" <<<"$smoke_output"; then
  echo "PRE020_DB|status=failed|reason=smoke_marker_missing"
  exit 1
fi

function_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  p.prosecdef,
  p.provolatile,
  pg_catalog.has_function_privilege('financial_app_gateway','financial_app.export_current_workspace_data()','EXECUTE'),
  pg_catalog.has_function_privilege('anon','financial_app.export_current_workspace_data()','EXECUTE'),
  pg_catalog.has_function_privilege('authenticated','financial_app.export_current_workspace_data()','EXECUTE'),
  (
    select count(*)
    from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    where acl.grantee=0 and acl.privilege_type='EXECUTE'
  )
)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app' and p.proname='export_current_workspace_data';
SQL
)"

if [ "$function_evidence" != "f|s|t|f|f|0" ]; then
  echo "PRE020_DB|status=failed|reason=function_privilege_contract|evidence=${function_evidence}"
  exit 1
fi

echo "PRE020_DB|status=ok|smoke=cross_tenant_export|function=${function_evidence}|sha=${GITHUB_SHA}"
