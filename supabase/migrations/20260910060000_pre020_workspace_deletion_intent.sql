-- Financial App · PRE-020D · protocolo de intención/confirmación de borrado
-- FOUNDATION NO DESTRUCTIVA: esta migración no elimina datos del usuario ni implementa
-- el ejecutor de borrado. Sólo crea una máquina de estados owner-only, idempotente y
-- cancelable hasta confirmación. La ejecución destructiva queda expresamente bloqueada.

create table financial_app.workspace_deletion_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references financial_app.workspaces(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  confirmation_nonce uuid not null default gen_random_uuid(),
  status text not null default 'prepared',
  impact_snapshot jsonb not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  cancelled_at timestamptz null,
  execution_attempts integer not null default 0,
  last_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_deletion_intents_status_check
    check (status in ('prepared','confirmed','cancelled','expired','executing','failed','completed')),
  constraint workspace_deletion_intents_expiry_check check (expires_at > created_at),
  constraint workspace_deletion_intents_attempts_check check (execution_attempts >= 0),
  constraint workspace_deletion_intents_request_key_unique unique (workspace_id, request_key)
);

create unique index workspace_deletion_intents_one_open_per_workspace
  on financial_app.workspace_deletion_intents(workspace_id)
  where status in ('prepared','confirmed','executing','failed');

create index workspace_deletion_intents_workspace_status_idx
  on financial_app.workspace_deletion_intents(workspace_id,status,created_at desc);

alter table financial_app.workspace_deletion_intents enable row level security;
alter table financial_app.workspace_deletion_intents force row level security;

create policy workspace_deletion_intents_workspace_isolation
  on financial_app.workspace_deletion_intents
  for all
  to financial_app_gateway
  using (workspace_id = financial_app.require_current_workspace_id())
  with check (workspace_id = financial_app.require_current_workspace_id());

revoke all on table financial_app.workspace_deletion_intents from public;
revoke all on table financial_app.workspace_deletion_intents from anon;
revoke all on table financial_app.workspace_deletion_intents from authenticated;
revoke all on table financial_app.workspace_deletion_intents from service_role;
grant select, insert, update on table financial_app.workspace_deletion_intents to financial_app_gateway;

create or replace function financial_app.prepare_workspace_deletion_intent(
  p_request_key uuid
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_role text := nullif(pg_catalog.current_setting('financial_app.workspace_role', true), '');
  v_user_setting text := nullif(pg_catalog.current_setting('financial_app.user_id', true), '');
  v_user_id uuid;
  v_existing financial_app.workspace_deletion_intents%rowtype;
  v_impact jsonb;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_request_key is null then
    raise exception using errcode='22023', message='workspace_deletion_request_key_required';
  end if;
  begin
    v_user_id := v_user_setting::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode='42501', message='workspace_user_context_invalid';
  end;
  if v_user_id is null then
    raise exception using errcode='42501', message='workspace_user_context_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.workspace_deletion:' || v_workspace_id::text)
  );

  -- El mismo TTL gobierna prepared y confirmed mientras no exista ejecutor. Así un
  -- confirmed abandonado nunca bloquea el workspace indefinidamente.
  update financial_app.workspace_deletion_intents
  set status='expired', updated_at=now()
  where workspace_id=v_workspace_id
    and status in ('prepared','confirmed')
    and expires_at <= now();

  select * into v_existing
  from financial_app.workspace_deletion_intents
  where workspace_id=v_workspace_id and request_key=p_request_key;

  if found then
    if v_existing.status in ('prepared','confirmed') and v_existing.expires_at > now() then
      return pg_catalog.jsonb_build_object(
        'contractVersion',1,
        'intentId',v_existing.id,
        'requestKey',v_existing.request_key,
        'confirmationNonce',v_existing.confirmation_nonce,
        'status',v_existing.status,
        'expiresAt',v_existing.expires_at,
        'impact',v_existing.impact_snapshot,
        'idempotentReplay',true,
        'destructiveOperationExecuted',false
      );
    end if;
    raise exception using errcode='23505', message='workspace_deletion_request_key_reused';
  end if;

  if exists (
    select 1 from financial_app.workspace_deletion_intents
    where workspace_id=v_workspace_id
      and status in ('prepared','confirmed','executing','failed')
  ) then
    raise exception using errcode='55000', message='workspace_deletion_intent_already_open';
  end if;

  v_impact := financial_app.workspace_deletion_impact();

  insert into financial_app.workspace_deletion_intents(
    workspace_id,requested_by_user_id,request_key,status,impact_snapshot,expires_at
  ) values (
    v_workspace_id,v_user_id,p_request_key,'prepared',v_impact,now()+interval '10 minutes'
  ) returning * into v_existing;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,
    'intentId',v_existing.id,
    'requestKey',v_existing.request_key,
    'confirmationNonce',v_existing.confirmation_nonce,
    'status',v_existing.status,
    'expiresAt',v_existing.expires_at,
    'impact',v_existing.impact_snapshot,
    'idempotentReplay',false,
    'destructiveOperationExecuted',false
  );
end;
$$;

create or replace function financial_app.confirm_workspace_deletion_intent(
  p_intent_id uuid,
  p_confirmation_nonce uuid
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_role text := nullif(pg_catalog.current_setting('financial_app.workspace_role', true), '');
  v_intent financial_app.workspace_deletion_intents%rowtype;
  v_current_impact jsonb;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_intent_id is null or p_confirmation_nonce is null then
    raise exception using errcode='22023', message='workspace_deletion_confirmation_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.workspace_deletion:' || v_workspace_id::text)
  );

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where id=p_intent_id and workspace_id=v_workspace_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='workspace_deletion_intent_not_found';
  end if;
  if v_intent.confirmation_nonce is distinct from p_confirmation_nonce then
    raise exception using errcode='42501', message='workspace_deletion_confirmation_invalid';
  end if;

  if v_intent.status='expired' then
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,'intentId',v_intent.id,'status','expired',
      'idempotentReplay',true,'executionReady',false,'destructiveOperationExecuted',false
    );
  end if;

  if v_intent.status in ('prepared','confirmed') and v_intent.expires_at <= now() then
    update financial_app.workspace_deletion_intents
    set status='expired',updated_at=now()
    where id=v_intent.id
    returning * into v_intent;
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,'intentId',v_intent.id,'status','expired',
      'idempotentReplay',false,'executionReady',false,'destructiveOperationExecuted',false
    );
  end if;

  if v_intent.status='confirmed' then
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,'intentId',v_intent.id,'status','confirmed',
      'confirmedAt',v_intent.confirmed_at,'idempotentReplay',true,
      'executionReady',true,'destructiveOperationExecuted',false
    );
  end if;
  if v_intent.status <> 'prepared' then
    raise exception using errcode='55000', message='workspace_deletion_intent_not_prepared';
  end if;

  v_current_impact := financial_app.workspace_deletion_impact();
  if v_current_impact is distinct from v_intent.impact_snapshot then
    raise exception using errcode='40001', message='workspace_deletion_impact_changed';
  end if;

  update financial_app.workspace_deletion_intents
  set status='confirmed',confirmed_at=now(),updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,'intentId',v_intent.id,'status','confirmed',
    'confirmedAt',v_intent.confirmed_at,'idempotentReplay',false,
    'executionReady',true,'destructiveOperationExecuted',false
  );
end;
$$;

create or replace function financial_app.cancel_workspace_deletion_intent(
  p_intent_id uuid
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_role text := nullif(pg_catalog.current_setting('financial_app.workspace_role', true), '');
  v_intent financial_app.workspace_deletion_intents%rowtype;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_intent_id is null then
    raise exception using errcode='22023', message='workspace_deletion_intent_id_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.workspace_deletion:' || v_workspace_id::text)
  );

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where id=p_intent_id and workspace_id=v_workspace_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='workspace_deletion_intent_not_found';
  end if;

  if v_intent.status='cancelled' then
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,'intentId',v_intent.id,'status','cancelled',
      'idempotentReplay',true,'destructiveOperationExecuted',false
    );
  end if;
  if v_intent.status='expired' then
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,'intentId',v_intent.id,'status','expired',
      'idempotentReplay',true,'destructiveOperationExecuted',false
    );
  end if;
  if v_intent.status <> 'prepared' then
    raise exception using errcode='55000', message='workspace_deletion_intent_not_cancellable';
  end if;

  update financial_app.workspace_deletion_intents
  set status=case when expires_at <= now() then 'expired' else 'cancelled' end,
      cancelled_at=case when expires_at > now() then now() else null end,
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,'intentId',v_intent.id,'status',v_intent.status,
    'idempotentReplay',false,'destructiveOperationExecuted',false
  );
end;
$$;

comment on table financial_app.workspace_deletion_intents is
  'PRE-020D control-plane state only. Confirmation never executes deletion; destructive execution is not implemented.';
comment on function financial_app.prepare_workspace_deletion_intent(uuid) is
  'Creates/replays a short-lived owner-only deletion intent; no user data is deleted.';
comment on function financial_app.confirm_workspace_deletion_intent(uuid,uuid) is
  'Confirms a fresh impact snapshot; confirmation does not execute deletion.';
comment on function financial_app.cancel_workspace_deletion_intent(uuid) is
  'Cancels a prepared deletion intent before confirmation.';

revoke all on function financial_app.prepare_workspace_deletion_intent(uuid) from public,anon,authenticated,service_role;
revoke all on function financial_app.confirm_workspace_deletion_intent(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function financial_app.cancel_workspace_deletion_intent(uuid) from public,anon,authenticated,service_role;
grant execute on function financial_app.prepare_workspace_deletion_intent(uuid) to financial_app_gateway;
grant execute on function financial_app.confirm_workspace_deletion_intent(uuid,uuid) to financial_app_gateway;
grant execute on function financial_app.cancel_workspace_deletion_intent(uuid) to financial_app_gateway;
