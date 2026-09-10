-- PRE-020D · protocolo owner-only/idempotente de intención de borrado
-- No ejecuta borrado. Toda mutación queda dentro de una transacción desechable y termina en ROLLBACK.
\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values
  ('d9000000-0000-4000-8000-000000000001'::uuid),
  ('d9000000-0000-4000-8000-000000000002'::uuid),
  ('d9000000-0000-4000-8000-000000000003'::uuid);

insert into financial_app.workspaces(id,name)
values
  ('d1000000-0000-4000-8000-000000000001'::uuid,'PRE020D intent tenant A'),
  ('d2000000-0000-4000-8000-000000000002'::uuid,'PRE020D intent tenant B');

insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default)
values
  ('d1000000-0000-4000-8000-000000000001'::uuid,'d9000000-0000-4000-8000-000000000001'::uuid,'owner',true,false),
  ('d1000000-0000-4000-8000-000000000001'::uuid,'d9000000-0000-4000-8000-000000000002'::uuid,'member',true,false),
  ('d2000000-0000-4000-8000-000000000002'::uuid,'d9000000-0000-4000-8000-000000000003'::uuid,'owner',true,false);

insert into financial_app.accounts(
  id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values
  ('d1100000-0000-4000-8000-000000000011'::uuid,'d1000000-0000-4000-8000-000000000001'::uuid,'PRE020D account A1','Synthetic A','checking',10000,'EUR','active',0),
  ('d2100000-0000-4000-8000-000000000021'::uuid,'d2000000-0000-4000-8000-000000000002'::uuid,'PRE020D account B1','Synthetic B','checking',20000,'EUR','active',0);

set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','d1000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','d9000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','2',false);

do $$
declare
  v_first jsonb;
  v_retry jsonb;
  v_intent_id uuid;
  v_nonce uuid;
  v_blocked boolean;
  v_confirmed jsonb;
  v_confirmed_retry jsonb;
  v_expired_first jsonb;
  v_expired_retry jsonb;
  v_cancel_expired_first jsonb;
  v_cancel_expired_retry jsonb;
  v_count integer;
begin
  v_first := financial_app.prepare_workspace_deletion_intent('d3000000-0000-4000-8000-000000000003'::uuid);
  v_retry := financial_app.prepare_workspace_deletion_intent('d3000000-0000-4000-8000-000000000003'::uuid);
  v_intent_id := (v_first->>'intentId')::uuid;
  v_nonce := (v_first->>'confirmationNonce')::uuid;

  if v_first->>'status' <> 'prepared' or (v_first->>'destructiveOperationExecuted')::boolean then
    raise exception 'PRE020D_PREPARE_CONTRACT_INVALID:%',v_first;
  end if;
  if (v_retry->>'intentId')::uuid <> v_intent_id
     or (v_retry->>'confirmationNonce')::uuid <> v_nonce
     or not (v_retry->>'idempotentReplay')::boolean then
    raise exception 'PRE020D_PREPARE_NOT_IDEMPOTENT:%',v_retry;
  end if;
  select count(*)::int into v_count from financial_app.workspace_deletion_intents;
  if v_count <> 1 then raise exception 'PRE020D_PREPARE_DUPLICATED:%',v_count; end if;

  v_blocked := false;
  begin
    perform financial_app.prepare_workspace_deletion_intent('d4000000-0000-4000-8000-000000000004'::uuid);
  exception when others then
    if sqlerrm='workspace_deletion_intent_already_open' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020D_SECOND_OPEN_INTENT_ACCEPTED'; end if;

  -- Cambiar los datos tras el preflight debe invalidar la confirmación.
  insert into financial_app.accounts(
    id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
  ) values (
    'd1200000-0000-4000-8000-000000000012'::uuid,'PRE020D account A2','Synthetic A','checking',30000,'EUR','active',1
  );

  v_blocked := false;
  begin
    perform financial_app.confirm_workspace_deletion_intent(v_intent_id,v_nonce);
  exception when others then
    if sqlerrm='workspace_deletion_impact_changed' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020D_STALE_IMPACT_CONFIRMED'; end if;

  perform financial_app.cancel_workspace_deletion_intent(v_intent_id);

  v_first := financial_app.prepare_workspace_deletion_intent('d4000000-0000-4000-8000-000000000004'::uuid);
  v_intent_id := (v_first->>'intentId')::uuid;
  v_nonce := (v_first->>'confirmationNonce')::uuid;

  v_blocked := false;
  begin
    perform financial_app.confirm_workspace_deletion_intent(
      v_intent_id,'d5000000-0000-4000-8000-000000000005'::uuid
    );
  exception when others then
    if sqlerrm='workspace_deletion_confirmation_invalid' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020D_WRONG_NONCE_CONFIRMED'; end if;

  v_confirmed := financial_app.confirm_workspace_deletion_intent(v_intent_id,v_nonce);
  v_confirmed_retry := financial_app.confirm_workspace_deletion_intent(v_intent_id,v_nonce);
  if v_confirmed->>'status' <> 'confirmed'
     or (v_confirmed->>'destructiveOperationExecuted')::boolean
     or not (v_confirmed_retry->>'idempotentReplay')::boolean then
    raise exception 'PRE020D_CONFIRM_CONTRACT_INVALID first=% retry=%',v_confirmed,v_confirmed_retry;
  end if;

  v_blocked := false;
  begin
    perform financial_app.cancel_workspace_deletion_intent(v_intent_id);
  exception when others then
    if sqlerrm='workspace_deletion_intent_not_cancellable' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020D_CONFIRMED_INTENT_CANCELLED'; end if;

  -- Un confirmed abandonado debe caducar y liberar el workspace; el retry de confirm
  -- debe ser idempotente y nunca volver a abrir ni ejecutar nada.
  update financial_app.workspace_deletion_intents
  set created_at=now()-interval '20 minutes', expires_at=now()-interval '10 minutes'
  where id=v_intent_id;
  v_expired_first := financial_app.confirm_workspace_deletion_intent(v_intent_id,v_nonce);
  v_expired_retry := financial_app.confirm_workspace_deletion_intent(v_intent_id,v_nonce);
  if v_expired_first->>'status' <> 'expired'
     or (v_expired_first->>'idempotentReplay')::boolean
     or v_expired_retry->>'status' <> 'expired'
     or not (v_expired_retry->>'idempotentReplay')::boolean
     or (v_expired_retry->>'destructiveOperationExecuted')::boolean then
    raise exception 'PRE020D_CONFIRMED_EXPIRY_NOT_IDEMPOTENT first=% retry=%',v_expired_first,v_expired_retry;
  end if;

  -- Tras expirar el confirmed debe poder abrirse un intent nuevo. Si éste caduca antes
  -- de cancelar, ambos cancel retries deben responder expired de forma estable.
  v_first := financial_app.prepare_workspace_deletion_intent('d8000000-0000-4000-8000-000000000008'::uuid);
  v_intent_id := (v_first->>'intentId')::uuid;
  update financial_app.workspace_deletion_intents
  set created_at=now()-interval '20 minutes', expires_at=now()-interval '10 minutes'
  where id=v_intent_id;
  v_cancel_expired_first := financial_app.cancel_workspace_deletion_intent(v_intent_id);
  v_cancel_expired_retry := financial_app.cancel_workspace_deletion_intent(v_intent_id);
  if v_cancel_expired_first->>'status' <> 'expired'
     or (v_cancel_expired_first->>'idempotentReplay')::boolean
     or v_cancel_expired_retry->>'status' <> 'expired'
     or not (v_cancel_expired_retry->>'idempotentReplay')::boolean
     or (v_cancel_expired_retry->>'destructiveOperationExecuted')::boolean then
    raise exception 'PRE020D_CANCEL_EXPIRY_NOT_IDEMPOTENT first=% retry=%',v_cancel_expired_first,v_cancel_expired_retry;
  end if;

  select count(*)::int into v_count from financial_app.accounts;
  if v_count <> 2 then raise exception 'PRE020D_BUSINESS_ROWS_CHANGED:%',v_count; end if;
end
$$;

-- Un miembro no puede ni preparar un intent.
select
  pg_catalog.set_config('financial_app.user_id','d9000000-0000-4000-8000-000000000002',false),
  pg_catalog.set_config('financial_app.workspace_role','member',false);
do $$
declare v_blocked boolean := false;
begin
  begin
    perform financial_app.prepare_workspace_deletion_intent('d6000000-0000-4000-8000-000000000006'::uuid);
  exception when others then
    if sqlerrm='workspace_owner_required' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020D_MEMBER_PREPARED_INTENT'; end if;
end
$$;

-- Tenant B no puede inferir ni ver los intents de A.
select
  pg_catalog.set_config('financial_app.workspace_id','d2000000-0000-4000-8000-000000000002',false),
  pg_catalog.set_config('financial_app.user_id','d9000000-0000-4000-8000-000000000003',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);
do $$
declare v_count integer;
begin
  select count(*)::int into v_count from financial_app.workspace_deletion_intents;
  if v_count <> 0 then raise exception 'PRE020D_CROSS_TENANT_INTENT_LEAK:%',v_count; end if;
  if (financial_app.prepare_workspace_deletion_intent('d7000000-0000-4000-8000-000000000007'::uuid)->>'status') <> 'prepared' then
    raise exception 'PRE020D_TENANT_B_PREPARE_FAILED';
  end if;
  select count(*)::int into v_count from financial_app.workspace_deletion_intents;
  if v_count <> 1 then raise exception 'PRE020D_TENANT_B_RLS_COUNT:%',v_count; end if;
end
$$;

reset role;
rollback;

\echo PRE020_DELETION_INTENT_SMOKE_OK
