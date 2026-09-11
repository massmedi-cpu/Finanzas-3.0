#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact CR-001D evidence}"
source scripts/pre020-disposable-db-smoke.sh

MIGRATION="supabase/migrations/20260911090000_cr001_workspace_deletion_self_service_readiness.sql"
if [ ! -f "$MIGRATION" ]; then
  echo "CR001D_SELF_SERVICE|status=failed|reason=missing_migration|file=${MIGRATION}"
  exit 1
fi
psql_db -f "$MIGRATION" >/dev/null

privileges="$(psql_db -At <<'SQL'
select concat_ws('|',
  pg_catalog.has_function_privilege('financial_app_gateway','financial_app.workspace_deletion_readiness()','EXECUTE'),
  pg_catalog.has_function_privilege('public','financial_app.workspace_deletion_readiness()','EXECUTE'),
  pg_catalog.has_function_privilege('anon','financial_app.workspace_deletion_readiness()','EXECUTE'),
  pg_catalog.has_function_privilege('authenticated','financial_app.workspace_deletion_readiness()','EXECUTE'),
  pg_catalog.has_function_privilege('service_role','financial_app.workspace_deletion_readiness()','EXECUTE'));
SQL
)"
[ "$privileges" = "t|f|f|f|f" ] || {
  echo "CR001D_SELF_SERVICE|status=failed|reason=readiness_privilege_contract|evidence=${privileges}"
  exit 1
}

output="$(psql_db -At <<'SQL'
begin;
insert into auth.users(id) values ('d9000000-0000-4000-8000-000000000001'::uuid);
insert into financial_app.workspaces(id,name)
values ('d1000000-0000-4000-8000-000000000001'::uuid,'CR001D disposable self service');
insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default)
values ('d1000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','owner',true,true);

set role financial_app_gateway;
select pg_catalog.set_config('financial_app.workspace_id','d1000000-0000-4000-8000-000000000001',false);
select pg_catalog.set_config('financial_app.user_id','d9000000-0000-4000-8000-000000000001',false);
select pg_catalog.set_config('financial_app.workspace_role','owner',false);
select pg_catalog.set_config('financial_app.workspace_membership_count','1',false);

do $$
declare
  v jsonb;
  v_endpoint jsonb;
  v_retention jsonb;
  v_activation jsonb;
begin
  v := financial_app.workspace_deletion_readiness();
  if (v->>'contractVersion')::int <> 3
     or (v->>'canExecute')::boolean
     or (v->>'destructiveOperationExecuted')::boolean
     or (v#>>'{runtimeFoundation,selfServiceExecutionEndpointExposed}')::boolean is distinct from true
     or (v#>>'{runtimeFoundation,commercialPolicyConfigured}')::boolean
     or (v#>>'{runtimeFoundation,productionActivated}')::boolean then
    raise exception 'CR001D_READINESS_NOT_FAIL_CLOSED:%',v;
  end if;

  select value into v_endpoint
  from pg_catalog.jsonb_array_elements(v->'blockers') value
  where value->>'code'='self_service_execution_endpoint_not_exposed';
  select value into v_retention
  from pg_catalog.jsonb_array_elements(v->'blockers') value
  where value->>'code'='post_deletion_receipt_retention_policy_not_defined';
  select value into v_activation
  from pg_catalog.jsonb_array_elements(v->'blockers') value
  where value->>'code'='production_activation_not_approved';

  if v_endpoint is null or (v_endpoint->>'resolved')::boolean is distinct from true then
    raise exception 'CR001D_ENDPOINT_BLOCKER_NOT_RESOLVED:%',v;
  end if;
  if v_retention is null or (v_retention->>'resolved')::boolean then
    raise exception 'CR001D_RETENTION_RESOLVED_PREMATURELY:%',v;
  end if;
  if v_activation is null or (v_activation->>'resolved')::boolean then
    raise exception 'CR001D_ACTIVATION_RESOLVED_PREMATURELY:%',v;
  end if;

  begin
    perform financial_app.begin_workspace_deletion_execution('d3000000-0000-4000-8000-000000000003'::uuid);
    raise exception 'CR001D_EXECUTION_ALLOWED_WITH_POLICY_OFF';
  exception when others then
    if sqlerrm <> 'workspace_deletion_execution_policy_not_approved' then raise; end if;
  end;
end
$$;

reset role;
rollback;
select 'CR001D_SELF_SERVICE_POSTFLIGHT_OK';
SQL
)"
printf '%s\n' "$output"
grep -q "CR001D_SELF_SERVICE_POSTFLIGHT_OK" <<<"$output" || {
  echo "CR001D_SELF_SERVICE|status=failed|reason=postflight_marker_missing"
  exit 1
}

echo "CR001D_SELF_SERVICE|status=ok|readiness_privileges=${privileges}|policy=off|endpoint=modeled_exposed|destructive_execution=blocked|sha=${GITHUB_SHA}"
