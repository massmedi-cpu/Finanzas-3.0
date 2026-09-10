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
  "supabase/migrations/20260910060000_pre020_workspace_deletion_intent.sql"
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

delete_intent_smoke_output="$(psql_db -f scripts/pre020-deletion-intent-smoke.sql)"
printf '%s\n' "$delete_intent_smoke_output"
if ! grep -q "PRE020_DELETION_INTENT_SMOKE_OK" <<<"$delete_intent_smoke_output"; then
  echo "PRE020_DB|status=failed|reason=deletion_intent_smoke_marker_missing"
  exit 1
fi

delete_rehearsal_output="$(psql_db -f scripts/pre020-workspace-deletion-execution-rehearsal.sql)"
printf '%s\n' "$delete_rehearsal_output"
if ! grep -q "PRE020_DELETION_EXECUTION_REHEARSAL_OK" <<<"$delete_rehearsal_output"; then
  echo "PRE020_DB|status=failed|reason=deletion_execution_rehearsal_marker_missing"
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

delete_intent_table_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  c.relrowsecurity,
  c.relforcerowsecurity,
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_intents','SELECT'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_intents','INSERT'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_intents','UPDATE'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_intents','DELETE'),
  pg_catalog.has_table_privilege('anon','financial_app.workspace_deletion_intents','SELECT'),
  pg_catalog.has_table_privilege('authenticated','financial_app.workspace_deletion_intents','SELECT'),
  pg_catalog.has_table_privilege('service_role','financial_app.workspace_deletion_intents','SELECT')
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='financial_app' and c.relname='workspace_deletion_intents';
SQL
)"

if [ "$delete_intent_table_evidence" != "t|t|t|t|t|f|f|f|f" ]; then
  echo "PRE020_DB|status=failed|reason=deletion_intent_table_privilege_contract|evidence=${delete_intent_table_evidence}"
  exit 1
fi

delete_intent_functions_evidence="$(psql_db -At <<'SQL'
select pg_catalog.string_agg(
  concat_ws(':',p.proname,p.prosecdef,p.provolatile,
    pg_catalog.has_function_privilege('financial_app_gateway',p.oid,'EXECUTE'),
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
    pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')),
  ',' order by p.proname
)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app'
  and p.proname in (
    'prepare_workspace_deletion_intent',
    'confirm_workspace_deletion_intent',
    'cancel_workspace_deletion_intent'
  );
SQL
)"

expected_intent_functions="cancel_workspace_deletion_intent:f:v:t:f:f:f,confirm_workspace_deletion_intent:f:v:t:f:f:f,prepare_workspace_deletion_intent:f:v:t:f:f:f"
if [ "$delete_intent_functions_evidence" != "$expected_intent_functions" ]; then
  echo "PRE020_DB|status=failed|reason=deletion_intent_function_privilege_contract|evidence=${delete_intent_functions_evidence}"
  exit 1
fi

runtime_executor_evidence="$(psql_db -At <<'SQL'
select count(*)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app'
  and p.proname in ('execute_workspace_deletion','workspace_deletion_execute');
SQL
)"
if [ "$runtime_executor_evidence" != "0" ]; then
  echo "PRE020_DB|status=failed|reason=unexpected_runtime_deletion_executor|count=${runtime_executor_evidence}"
  exit 1
fi

echo "PRE020_DB|status=ok|smoke=cross_tenant_export+owner_only_deletion_impact+idempotent_deletion_intent+admin_only_deletion_execution_rehearsal|export_function=${export_function_evidence}|deletion_impact_function=${delete_impact_function_evidence}|deletion_intent_table=${delete_intent_table_evidence}|deletion_intent_functions=${delete_intent_functions_evidence}|runtime_executor=${runtime_executor_evidence}|sha=${GITHUB_SHA}"
