-- PRE-020C · manifiesto owner-only/read-only de impacto de borrado
-- Ejecutar sólo sobre la PostgreSQL 17 desechable preparada por PRE-001/PRE-020.
\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values
  ('c9000000-0000-4000-8000-000000000001'::uuid),
  ('c9000000-0000-4000-8000-000000000002'::uuid),
  ('c9000000-0000-4000-8000-000000000003'::uuid),
  ('c9000000-0000-4000-8000-000000000004'::uuid);

insert into financial_app.workspaces(id,name)
values
  ('c1000000-0000-4000-8000-000000000001'::uuid,'PRE020C deletion tenant A'),
  ('c2000000-0000-4000-8000-000000000002'::uuid,'PRE020C deletion tenant B');

insert into financial_app.workspace_memberships(
  workspace_id,user_id,role,active,is_default
) values
  ('c1000000-0000-4000-8000-000000000001'::uuid,'c9000000-0000-4000-8000-000000000001'::uuid,'owner',true,false),
  ('c1000000-0000-4000-8000-000000000001'::uuid,'c9000000-0000-4000-8000-000000000002'::uuid,'member',true,false),
  ('c1000000-0000-4000-8000-000000000001'::uuid,'c9000000-0000-4000-8000-000000000004'::uuid,'member',false,false),
  ('c2000000-0000-4000-8000-000000000002'::uuid,'c9000000-0000-4000-8000-000000000003'::uuid,'owner',true,false);

insert into financial_app.accounts(
  id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values
  ('c1100000-0000-4000-8000-000000000011'::uuid,'c1000000-0000-4000-8000-000000000001'::uuid,'PRE020C account A','Synthetic A','checking',10101,'EUR','active',0),
  ('c2100000-0000-4000-8000-000000000021'::uuid,'c2000000-0000-4000-8000-000000000002'::uuid,'PRE020C account B','Synthetic B','checking',20202,'EUR','active',0);

set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','c1000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','c9000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','3',false);

do $$
declare
  v_impact jsonb := financial_app.workspace_deletion_impact();
begin
  if v_impact->>'workspaceId' <> 'c1000000-0000-4000-8000-000000000001' then
    raise exception 'PRE020C_A_WORKSPACE_MISMATCH:%',v_impact->>'workspaceId';
  end if;
  if (v_impact#>>'{rowCounts,accounts}')::bigint <> 1 then
    raise exception 'PRE020C_A_ACCOUNT_COUNT:%',v_impact#>>'{rowCounts,accounts}';
  end if;
  if (v_impact#>>'{summary,workspaceMemberships}')::bigint <> 3 then
    raise exception 'PRE020C_A_MEMBERSHIP_COUNT:%',v_impact#>>'{summary,workspaceMemberships}';
  end if;
  if (v_impact->>'destructiveOperationExecuted')::boolean then
    raise exception 'PRE020C_DESTRUCTIVE_FLAG_TRUE';
  end if;
  if v_impact#>>'{effects,officialBankSource}' <> 'untouched'
     or v_impact#>>'{effects,googleDriveFiles}' <> 'untouched' then
    raise exception 'PRE020C_EXTERNAL_SOURCE_CONTRACT_BROKEN';
  end if;
  if not (v_impact->'blockers') ? 'self_service_deletion_not_implemented'
     or not (v_impact->'blockers') ? 'production_activation_not_approved' then
    raise exception 'PRE020C_BLOCKERS_MISSING';
  end if;
end
$$;

-- Simula el contexto resuelto por Edge para un miembro activo: el manifiesto debe fallar cerrado.
select
  pg_catalog.set_config('financial_app.user_id','c9000000-0000-4000-8000-000000000002',false),
  pg_catalog.set_config('financial_app.workspace_role','member',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','3',false);
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform financial_app.workspace_deletion_impact();
  exception when others then
    if sqlerrm = 'workspace_owner_required' then
      v_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_blocked then raise exception 'PRE020C_MEMBER_WAS_NOT_BLOCKED'; end if;
end
$$;

-- Cambiar a B debe ocultar por RLS cualquier fila de A.
select
  pg_catalog.set_config('financial_app.workspace_id','c2000000-0000-4000-8000-000000000002',false),
  pg_catalog.set_config('financial_app.user_id','c9000000-0000-4000-8000-000000000003',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);
do $$
declare
  v_impact jsonb := financial_app.workspace_deletion_impact();
begin
  if v_impact->>'workspaceId' <> 'c2000000-0000-4000-8000-000000000002' then
    raise exception 'PRE020C_B_WORKSPACE_MISMATCH';
  end if;
  if (v_impact#>>'{rowCounts,accounts}')::bigint <> 1 then
    raise exception 'PRE020C_B_ACCOUNT_COUNT:%',v_impact#>>'{rowCounts,accounts}';
  end if;
  if (v_impact#>>'{summary,workspaceMemberships}')::bigint <> 1 then
    raise exception 'PRE020C_B_MEMBERSHIP_COUNT:%',v_impact#>>'{summary,workspaceMemberships}';
  end if;
end
$$;

-- Sin contexto de membership el manifiesto debe fallar, incluso si existe workspace_id.
select
  pg_catalog.set_config('financial_app.workspace_role','',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','',false);
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform financial_app.workspace_deletion_impact();
  exception when others then
    if sqlerrm = 'workspace_membership_context_required' then
      v_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_blocked then raise exception 'PRE020C_WITHOUT_MEMBERSHIP_CONTEXT_ACCEPTED'; end if;
end
$$;

select pg_catalog.set_config('financial_app.workspace_id','',false);
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform financial_app.workspace_deletion_impact();
  exception when others then
    if sqlerrm = 'workspace_context_required' then
      v_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_blocked then raise exception 'PRE020C_WITHOUT_WORKSPACE_ACCEPTED'; end if;
end
$$;

reset role;
rollback;

\echo PRE020_DELETION_IMPACT_SMOKE_OK
