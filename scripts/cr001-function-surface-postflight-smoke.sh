#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact CR-001 postflight evidence}"

# Reutiliza el baseline y los contratos PRE-020/CR-001 ya validados en Postgres desechable.
source scripts/pre020-disposable-db-smoke.sh

POSTFLIGHT_MIGRATION="supabase/migrations/20260911034500_cr001_function_surface_postflight.sql"
if [ ! -f "$POSTFLIGHT_MIGRATION" ]; then
  echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=missing_migration|file=${POSTFLIGHT_MIGRATION}"
  exit 1
fi

psql_db -f "$POSTFLIGHT_MIGRATION" >/dev/null

surface_evidence="$(psql_db -At <<'SQL'
with funcs as (
  select p.oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app'
)
select concat_ws('|',
  count(*),
  count(*) filter (where pg_catalog.has_function_privilege('public',oid,'EXECUTE')),
  count(*) filter (where pg_catalog.has_function_privilege('anon',oid,'EXECUTE')),
  count(*) filter (where pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE')),
  count(*) filter (where pg_catalog.has_function_privilege('service_role',oid,'EXECUTE')),
  count(*) filter (where pg_catalog.has_function_privilege('financial_app_gateway',oid,'EXECUTE'))
)
from funcs;
SQL
)"
IFS='|' read -r function_count public_exec anon_exec authenticated_exec service_exec gateway_exec <<<"$surface_evidence"
[ "$function_count" -gt 0 ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=no_functions"; exit 1; }
[ "$public_exec" = "0" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=public_execute|count=${public_exec}"; exit 1; }
[ "$anon_exec" = "0" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=anon_execute|count=${anon_exec}"; exit 1; }
[ "$authenticated_exec" = "0" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=authenticated_execute|count=${authenticated_exec}"; exit 1; }
[ "$service_exec" = "0" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=service_role_execute|count=${service_exec}"; exit 1; }
[ "$gateway_exec" = "$function_count" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=gateway_execute_surface|gateway=${gateway_exec}|functions=${function_count}"; exit 1; }

security_definers="$(psql_db -At <<'SQL'
select p.oid::pg_catalog.regprocedure::text
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app' and p.prosecdef=true
order by p.oid::pg_catalog.regprocedure::text;
SQL
)"
expected_security_definers="$(cat <<'EOF'
financial_app.disconnect_google_oauth_connection()
financial_app.finalize_workspace_deletion_local(uuid,uuid)
financial_app.get_google_oauth_connection_status()
financial_app.get_google_oauth_refresh_token()
financial_app.mark_google_oauth_verified()
financial_app.store_google_oauth_connection(text,text,text,text[],text,text)
EOF
)"
[ "$security_definers" = "$expected_security_definers" ] || {
  echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=security_definer_allowlist"
  printf 'actual:\n%s\n' "$security_definers"
  exit 1
}

bad_search_path="$(psql_db -At <<'SQL'
select count(*)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app'
  and p.prosecdef=true
  and not coalesce(p.proconfig @> array['search_path=""']::text[],false);
SQL
)"
[ "$bad_search_path" = "0" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=security_definer_search_path|count=${bad_search_path}"; exit 1; }

protected_table_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspaces','SELECT'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.workspace_memberships','SELECT'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','UPDATE'),
  pg_catalog.has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','DELETE')
);
SQL
)"
[ "$protected_table_evidence" = "f|f|f|f" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=protected_table_privileges|evidence=${protected_table_evidence}"; exit 1; }

# Comprueba que una función futura no recupere EXECUTE implícito para roles cliente/service_role.
psql_db <<'SQL' >/dev/null
create function financial_app.__cr001_default_acl_probe()
returns integer
language sql
as 'select 1';
SQL
probe_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  pg_catalog.has_function_privilege('public','financial_app.__cr001_default_acl_probe()','EXECUTE'),
  pg_catalog.has_function_privilege('anon','financial_app.__cr001_default_acl_probe()','EXECUTE'),
  pg_catalog.has_function_privilege('authenticated','financial_app.__cr001_default_acl_probe()','EXECUTE'),
  pg_catalog.has_function_privilege('service_role','financial_app.__cr001_default_acl_probe()','EXECUTE')
);
SQL
)"
psql_db -c 'drop function financial_app.__cr001_default_acl_probe();' >/dev/null
[ "$probe_evidence" = "f|f|f|f" ] || { echo "CR001_FUNCTION_POSTFLIGHT|status=failed|reason=future_function_default_acl|evidence=${probe_evidence}"; exit 1; }

echo "CR001_FUNCTION_POSTFLIGHT|status=ok|functions=${function_count}|public=0|anon=0|authenticated=0|service_role=0|gateway=${gateway_exec}|security_definers=6|search_path=ok|protected_tables=${protected_table_evidence}|future_defaults=${probe_evidence}|sha=${GITHUB_SHA}"
