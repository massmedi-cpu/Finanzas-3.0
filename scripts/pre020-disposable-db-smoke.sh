#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact PRE-020 evidence}"

# Reutiliza íntegramente el preparador/gate PRE-001. Al ejecutarse mediante source,
# su trap de cleanup queda activo hasta que este script termine, por lo que la DB
# desechable sigue disponible sólo para aplicar PRE-020 y se elimina al salir.
source scripts/pre001-disposable-db-smoke.sh

PRE020_MIGRATIONS=(
  "supabase/migrations/20260909213000_pre020_workspace_structured_export.sql"
  "supabase/migrations/20260910050000_pre020_workspace_deletion_impact.sql"
)

for migration in "${PRE020_MIGRATIONS[@]}"; do
  if [ ! -f "$migration" ]; then
    echo "PRE020_DB|status=failed|reason=missing_pre020_migration|file=${migration}"
    exit 1
  fi
  echo "PRE020_DB|migration=$(basename "$migration")"
  psql_db -f "$migration" >/dev/null
done

export_smoke_output="$(psql_db -f scripts/pre020-export-cross-tenant-smoke.sql)"
printf '%s\n' "$export_smoke_output"
if ! grep -q "PRE020_STRUCTURED_EXPORT_SMOKE_OK" <<<"$export_smoke_output"; then
  echo "PRE020_DB|status=failed|reason=export_smoke_marker_missing"
  exit 1
fi

delete_impact_smoke_output="$(psql_db -f scripts/pre020-deletion-impact-cross-tenant-smoke.sql)"
printf '%s\n' "$delete_impact_smoke_output"
if ! grep -q "PRE020_DELETION_IMPACT_SMOKE_OK" <<<"$delete_impact_smoke_output"; then
  echo "PRE020_DB|status=failed|reason=deletion_impact_smoke_marker_missing"
  exit 1
fi

export_function_evidence="$(psql_db -At <<'SQL'
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

if [ "$export_function_evidence" != "f|s|t|f|f|0" ]; then
  echo "PRE020_DB|status=failed|reason=export_function_privilege_contract|evidence=${export_function_evidence}"
  exit 1
fi

delete_impact_function_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  p.prosecdef,
  p.provolatile,
  pg_catalog.has_function_privilege('financial_app_gateway','financial_app.workspace_deletion_impact()','EXECUTE'),
  pg_catalog.has_function_privilege('anon','financial_app.workspace_deletion_impact()','EXECUTE'),
  pg_catalog.has_function_privilege('authenticated','financial_app.workspace_deletion_impact()','EXECUTE'),
  pg_catalog.has_function_privilege('service_role','financial_app.workspace_deletion_impact()','EXECUTE'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_memberships','SELECT'),
  (
    select count(*)
    from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    where acl.grantee=0 and acl.privilege_type='EXECUTE'
  )
)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app' and p.proname='workspace_deletion_impact';
SQL
)"

if [ "$delete_impact_function_evidence" != "f|s|t|f|f|f|f|0" ]; then
  echo "PRE020_DB|status=failed|reason=deletion_impact_function_privilege_contract|evidence=${delete_impact_function_evidence}"
  exit 1
fi

echo "PRE020_DB|status=ok|smoke=cross_tenant_export+owner_only_deletion_impact|export_function=${export_function_evidence}|deletion_impact_function=${delete_impact_function_evidence}|sha=${GITHUB_SHA}"
