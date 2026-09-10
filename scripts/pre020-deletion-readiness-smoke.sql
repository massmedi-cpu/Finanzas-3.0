-- PRE-020F · readiness owner-only, cross-tenant y siempre fail-closed.
-- Toda preparación/confirmación de prueba ocurre en DB desechable y termina en ROLLBACK.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
  ('f9000000-0000-4000-8000-000000000001'::uuid),
  ('f9000000-0000-4000-8000-000000000002'::uuid),
  ('f9000000-0000-4000-8000-000000000003'::uuid);
insert into financial_app.workspaces(id,name) values
  ('f1000000-0000-4000-8000-000000000001'::uuid,'PRE020F readiness tenant A'),
  ('f2000000-0000-4000-8000-000000000002'::uuid,'PRE020F readiness tenant B');
insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default) values
  ('f1000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','owner',true,false),
  ('f1000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','member',true,false),
  ('f2000000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-000000000003','owner',true,false);
insert into financial_app.accounts(id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order) values
  ('f1100000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000001','PRE020F account A','Synthetic A','checking',10000,'EUR','active',0),
  ('f2100000-0000-4000-8000-000000000021','f2000000-0000-4000-8000-000000000002','PRE020F account B','Synthetic B','checking',20000,'EUR','active',0);

set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','f1000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','f9000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','2',false);

do $$
declare
  v_before jsonb;
  v_prepared jsonb;
  v_confirmed jsonb;
  v_after jsonb;
  v_blocker jsonb;
begin
  v_before := financial_app.workspace_deletion_readiness();
  if (v_before->>'workspaceId')::uuid <> 'f1000000-0000-4000-8000-000000000001'::uuid
     or (v_before->>'canExecute')::boolean
     or (v_before->>'destructiveOperationExecuted')::boolean
     or v_before->'intent' is not null
     or (v_before#>>'{impact,rowCounts,accounts}')::bigint <> 1
     or v_before#>>'{preservedExternalSources,officialBankSource}' <> 'untouched'
     or v_before#>>'{preservedExternalSources,googleDriveFiles}' <> 'untouched' then
    raise exception 'PRE020F_INITIAL_READINESS_INVALID:%',v_before;
  end if;
  select value into v_blocker from pg_catalog.jsonb_array_elements(v_before->'blockers') value
   where value->>'code'='workspace_deletion_intent_not_confirmed';
  if v_blocker is null or (v_blocker->>'resolved')::boolean then
    raise exception 'PRE020F_INITIAL_INTENT_BLOCKER_INVALID:%',v_before;
  end if;

  v_prepared := financial_app.prepare_workspace_deletion_intent('f3000000-0000-4000-8000-000000000003'::uuid);
  v_confirmed := financial_app.confirm_workspace_deletion_intent(
    (v_prepared->>'intentId')::uuid,(v_prepared->>'confirmationNonce')::uuid
  );
  if v_confirmed->>'status' <> 'confirmed' then
    raise exception 'PRE020F_CONFIRM_FAILED:%',v_confirmed;
  end if;

  v_after := financial_app.workspace_deletion_readiness();
  if (v_after->>'canExecute')::boolean
     or (v_after->>'destructiveOperationExecuted')::boolean
     or v_after#>>'{intent,effectiveStatus}' <> 'confirmed'
     or not (v_after#>>'{intent,confirmedAndFresh}')::boolean then
    raise exception 'PRE020F_CONFIRMED_READINESS_NOT_FAIL_CLOSED:%',v_after;
  end if;
  select value into v_blocker from pg_catalog.jsonb_array_elements(v_after->'blockers') value
   where value->>'code'='workspace_deletion_intent_not_confirmed';
  if v_blocker is null or not (v_blocker->>'resolved')::boolean then
    raise exception 'PRE020F_CONFIRMED_INTENT_BLOCKER_NOT_RESOLVED:%',v_after;
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_after->'blockers') value
    where value->>'code' in (
      'destructive_executor_not_implemented',
      'supabase_storage_runtime_cleanup_not_validated',
      'post_deletion_receipt_retention_policy_not_defined',
      'production_activation_not_approved'
    ) and (value->>'resolved')::boolean
  ) then raise exception 'PRE020F_FIXED_BLOCKER_RESOLVED_PREMATURELY:%',v_after; end if;
end
$$;

-- Miembro: owner-only heredado del manifiesto.
select pg_catalog.set_config('financial_app.user_id','f9000000-0000-4000-8000-000000000002',false),
       pg_catalog.set_config('financial_app.workspace_role','member',false);
do $$ declare v_blocked boolean:=false; begin
  begin perform financial_app.workspace_deletion_readiness();
  exception when others then if sqlerrm='workspace_owner_required' then v_blocked:=true; else raise; end if; end;
  if not v_blocked then raise exception 'PRE020F_MEMBER_READINESS_ALLOWED'; end if;
end $$;

-- Tenant B: no ve el intent confirmado de A.
select pg_catalog.set_config('financial_app.workspace_id','f2000000-0000-4000-8000-000000000002',false),
       pg_catalog.set_config('financial_app.user_id','f9000000-0000-4000-8000-000000000003',false),
       pg_catalog.set_config('financial_app.workspace_role','owner',false),
       pg_catalog.set_config('financial_app.workspace_membership_count','1',false);
do $$ declare v jsonb; begin
  v:=financial_app.workspace_deletion_readiness();
  if (v->>'workspaceId')::uuid <> 'f2000000-0000-4000-8000-000000000002'::uuid
     or v->'intent' is not null
     or (v#>>'{impact,rowCounts,accounts}')::bigint <> 1
     or (v->>'canExecute')::boolean then
    raise exception 'PRE020F_CROSS_TENANT_LEAK:%',v;
  end if;
end $$;

-- Sin workspace: fail-closed por frontera de contexto.
select pg_catalog.set_config('financial_app.workspace_id','',false);
do $$ declare v_blocked boolean:=false; begin
  begin perform financial_app.workspace_deletion_readiness();
  exception when others then if sqlerrm='workspace_context_required' then v_blocked:=true; else raise; end if; end;
  if not v_blocked then raise exception 'PRE020F_EMPTY_WORKSPACE_CONTEXT_ALLOWED'; end if;
end $$;

reset role;
rollback;
\echo PRE020_DELETION_READINESS_SMOKE_OK
