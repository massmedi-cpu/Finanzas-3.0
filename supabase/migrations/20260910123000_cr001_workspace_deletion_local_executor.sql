-- Financial App · CR-001A · executor local de borrado con activación fail-closed
-- Primera fase posterior a la auditoría precomercial. Implementa la capacidad SQL local
-- necesaria para un borrado completo del workspace, pero NO la activa comercialmente.
-- La fuente bancaria oficial y los ficheros externos de Google Drive permanecen intocables.
-- El gateway conserva explícitamente la ausencia de DELETE sobre transaction_source_records.

create table financial_app.workspace_deletion_runtime_policy (
  id boolean primary key default true check (id),
  policy_version text null,
  deletion_receipt_retention_days integer null,
  retention_approved_at timestamptz null,
  execution_enabled boolean not null default false,
  activation_approved_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint workspace_deletion_runtime_policy_retention_consistency check (
    (
      policy_version is null
      and deletion_receipt_retention_days is null
      and retention_approved_at is null
    )
    or (
      policy_version is not null
      and btrim(policy_version) <> ''
      and deletion_receipt_retention_days between 1 and 3650
      and retention_approved_at is not null
    )
  ),
  constraint workspace_deletion_runtime_policy_activation_consistency check (
    not execution_enabled
    or (
      policy_version is not null
      and btrim(policy_version) <> ''
      and deletion_receipt_retention_days between 1 and 3650
      and retention_approved_at is not null
      and activation_approved_at is not null
    )
  )
);

insert into financial_app.workspace_deletion_runtime_policy(id)
values (true)
on conflict (id) do nothing;

comment on table financial_app.workspace_deletion_runtime_policy is
  'CR-001A fail-closed commercial control. Runtime deletion remains disabled until an explicit retention policy and activation approval exist.';

revoke all on table financial_app.workspace_deletion_runtime_policy from public,anon,authenticated,service_role;
revoke all on table financial_app.workspace_deletion_runtime_policy from financial_app_gateway;
grant select on table financial_app.workspace_deletion_runtime_policy to financial_app_gateway;

create table financial_app.workspace_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique,
  deleted_workspace_id uuid not null,
  requested_by_user_id uuid not null,
  policy_version text not null check (btrim(policy_version) <> ''),
  retention_days integer not null check (retention_days between 1 and 3650),
  summary jsonb not null,
  completed_at timestamptz not null,
  expires_at timestamptz not null,
  constraint workspace_deletion_receipts_expiry_check check (expires_at > completed_at)
);

comment on table financial_app.workspace_deletion_receipts is
  'CR-001A minimal post-deletion receipt. It has no workspace FK so an approved retention window can survive deletion of the workspace root.';

revoke all on table financial_app.workspace_deletion_receipts from public,anon,authenticated,service_role,financial_app_gateway;

alter table financial_app.workspace_deletion_intents
  add column execution_nonce uuid null,
  add column execution_started_at timestamptz null,
  add column storage_cleanup_verified_at timestamptz null,
  add column vault_cleanup_verified_at timestamptz null;

create or replace function financial_app.protect_bank_source_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent_id uuid;
  v_execution_nonce uuid;
begin
  if tg_op = 'DELETE' then
    begin
      v_intent_id := nullif(pg_catalog.current_setting('financial_app.workspace_delete_intent_id', true), '')::uuid;
      v_execution_nonce := nullif(pg_catalog.current_setting('financial_app.workspace_delete_execution_nonce', true), '')::uuid;
    exception when invalid_text_representation then
      v_intent_id := null;
      v_execution_nonce := null;
    end;

    if v_intent_id is not null
       and v_execution_nonce is not null
       and exists (
         select 1
         from financial_app.workspace_deletion_intents i
         where i.id = v_intent_id
           and i.workspace_id = old.workspace_id
           and i.status = 'executing'
           and i.execution_nonce = v_execution_nonce
           and i.storage_cleanup_verified_at is not null
           and i.vault_cleanup_verified_at is not null
       ) then
      return old;
    end if;
  end if;

  raise exception 'bank source records are immutable';
end;
$$;

create or replace function financial_app.begin_workspace_deletion_execution(
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
  v_user_setting text := nullif(pg_catalog.current_setting('financial_app.user_id', true), '');
  v_user_id uuid;
  v_policy financial_app.workspace_deletion_runtime_policy%rowtype;
  v_intent financial_app.workspace_deletion_intents%rowtype;
  v_current_impact jsonb;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_intent_id is null then
    raise exception using errcode='22023', message='workspace_deletion_intent_id_required';
  end if;
  begin
    v_user_id := v_user_setting::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode='42501', message='workspace_user_context_invalid';
  end;
  if v_user_id is null then
    raise exception using errcode='42501', message='workspace_user_context_required';
  end if;

  select * into v_policy
  from financial_app.workspace_deletion_runtime_policy
  where id = true;

  if not found
     or not v_policy.execution_enabled
     or v_policy.policy_version is null
     or v_policy.deletion_receipt_retention_days is null
     or v_policy.retention_approved_at is null
     or v_policy.activation_approved_at is null then
    raise exception using errcode='55000', message='workspace_deletion_execution_policy_not_approved';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.workspace_deletion:' || v_workspace_id::text)
  );

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where id = p_intent_id
    and workspace_id = v_workspace_id
    and requested_by_user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='workspace_deletion_intent_not_found';
  end if;

  if v_intent.status = 'executing' then
    if v_intent.execution_nonce is null then
      raise exception using errcode='55000', message='workspace_deletion_execution_state_invalid';
    end if;
    return pg_catalog.jsonb_build_object(
      'contractVersion',1,
      'intentId',v_intent.id,
      'status','executing',
      'executionNonce',v_intent.execution_nonce,
      'executionStartedAt',v_intent.execution_started_at,
      'idempotentReplay',true,
      'destructiveOperationExecuted',false,
      'policy',pg_catalog.jsonb_build_object(
        'version',v_policy.policy_version,
        'receiptRetentionDays',v_policy.deletion_receipt_retention_days
      )
    );
  end if;

  if v_intent.status <> 'confirmed' then
    raise exception using errcode='55000', message='workspace_deletion_intent_not_confirmed';
  end if;
  if v_intent.expires_at <= now() then
    update financial_app.workspace_deletion_intents
    set status='expired',updated_at=now()
    where id=v_intent.id;
    raise exception using errcode='55000', message='workspace_deletion_intent_expired';
  end if;

  v_current_impact := financial_app.workspace_deletion_impact();
  if v_current_impact is distinct from v_intent.impact_snapshot then
    raise exception using errcode='40001', message='workspace_deletion_impact_changed';
  end if;

  update financial_app.workspace_deletion_intents
  set status='executing',
      execution_nonce=coalesce(execution_nonce,gen_random_uuid()),
      execution_started_at=coalesce(execution_started_at,now()),
      execution_attempts=execution_attempts+1,
      last_error_code=null,
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,
    'intentId',v_intent.id,
    'status','executing',
    'executionNonce',v_intent.execution_nonce,
    'executionStartedAt',v_intent.execution_started_at,
    'idempotentReplay',false,
    'destructiveOperationExecuted',false,
    'policy',pg_catalog.jsonb_build_object(
      'version',v_policy.policy_version,
      'receiptRetentionDays',v_policy.deletion_receipt_retention_days
    )
  );
end;
$$;

create or replace function financial_app.record_workspace_deletion_external_cleanup(
  p_intent_id uuid,
  p_execution_nonce uuid,
  p_storage_cleanup_verified boolean,
  p_vault_cleanup_verified boolean
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
  v_intent financial_app.workspace_deletion_intents%rowtype;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_intent_id is null or p_execution_nonce is null then
    raise exception using errcode='22023', message='workspace_deletion_execution_proof_required';
  end if;
  if p_storage_cleanup_verified is distinct from true or p_vault_cleanup_verified is distinct from true then
    raise exception using errcode='22023', message='workspace_deletion_external_cleanup_not_verified';
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

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where id=p_intent_id
    and workspace_id=v_workspace_id
    and requested_by_user_id=v_user_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='workspace_deletion_intent_not_found';
  end if;
  if v_intent.status <> 'executing' or v_intent.execution_nonce is distinct from p_execution_nonce then
    raise exception using errcode='42501', message='workspace_deletion_execution_proof_invalid';
  end if;

  update financial_app.workspace_deletion_intents
  set storage_cleanup_verified_at=coalesce(storage_cleanup_verified_at,now()),
      vault_cleanup_verified_at=coalesce(vault_cleanup_verified_at,now()),
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,
    'intentId',v_intent.id,
    'status',v_intent.status,
    'storageCleanupVerifiedAt',v_intent.storage_cleanup_verified_at,
    'vaultCleanupVerifiedAt',v_intent.vault_cleanup_verified_at,
    'destructiveOperationExecuted',false
  );
end;
$$;

create or replace function financial_app.finalize_workspace_deletion_local(
  p_intent_id uuid,
  p_execution_nonce uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workspace_setting text := nullif(pg_catalog.current_setting('financial_app.workspace_id', true), '');
  v_user_setting text := nullif(pg_catalog.current_setting('financial_app.user_id', true), '');
  v_role text := nullif(pg_catalog.current_setting('financial_app.workspace_role', true), '');
  v_workspace_id uuid;
  v_user_id uuid;
  v_policy financial_app.workspace_deletion_runtime_policy%rowtype;
  v_intent financial_app.workspace_deletion_intents%rowtype;
  v_pending text[];
  v_table text;
  v_guard integer := 0;
  v_deleted_rows bigint := 0;
  v_last_deleted bigint := 0;
  v_count bigint := 0;
  v_root_deleted bigint := 0;
  v_receipt_id uuid;
  v_completed_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_role <> 'owner' then
    raise exception using errcode='42501', message='workspace_owner_required';
  end if;
  if p_intent_id is null or p_execution_nonce is null then
    raise exception using errcode='22023', message='workspace_deletion_execution_proof_required';
  end if;
  begin
    v_workspace_id := v_workspace_setting::uuid;
    v_user_id := v_user_setting::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode='42501', message='workspace_deletion_execution_context_invalid';
  end;
  if v_workspace_id is null or v_user_id is null then
    raise exception using errcode='42501', message='workspace_deletion_execution_context_required';
  end if;

  select * into v_policy
  from financial_app.workspace_deletion_runtime_policy
  where id=true;
  if not found
     or not v_policy.execution_enabled
     or v_policy.policy_version is null
     or v_policy.deletion_receipt_retention_days is null
     or v_policy.retention_approved_at is null
     or v_policy.activation_approved_at is null then
    raise exception using errcode='55000', message='workspace_deletion_execution_policy_not_approved';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.workspace_deletion:' || v_workspace_id::text)
  );

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where id=p_intent_id
    and workspace_id=v_workspace_id
    and requested_by_user_id=v_user_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='workspace_deletion_intent_not_found';
  end if;
  if v_intent.status <> 'executing'
     or v_intent.execution_nonce is distinct from p_execution_nonce then
    raise exception using errcode='42501', message='workspace_deletion_execution_proof_invalid';
  end if;
  if v_intent.storage_cleanup_verified_at is null or v_intent.vault_cleanup_verified_at is null then
    raise exception using errcode='55000', message='workspace_deletion_external_cleanup_not_verified';
  end if;

  select pg_catalog.array_agg(t.table_name order by t.table_name)
  into v_pending
  from (
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='financial_app'
      and c.column_name='workspace_id'
      and c.table_name not in (
        'workspace_deletion_intents',
        'workspace_memberships',
        'transaction_source_records'
      )
  ) t;

  while coalesce(pg_catalog.cardinality(v_pending),0) > 0 loop
    v_table := null;
    select p.table_name into v_table
    from pg_catalog.unnest(v_pending) as p(table_name)
    where not exists (
      select 1
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_class child on child.oid=fk.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
      join pg_catalog.pg_class parent on parent.oid=fk.confrelid
      join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
      where fk.contype='f'
        and child_ns.nspname='financial_app'
        and parent_ns.nspname='financial_app'
        and parent.relname=p.table_name
        and child.relname<>parent.relname
        and child.relname = any(v_pending)
    )
    order by p.table_name
    limit 1;

    if v_table is null then
      raise exception using errcode='2BP01', message='workspace_deletion_dependency_cycle';
    end if;

    execute pg_catalog.format(
      'delete from financial_app.%I where workspace_id=$1',v_table
    ) using v_workspace_id;
    get diagnostics v_last_deleted = row_count;
    v_deleted_rows := v_deleted_rows + v_last_deleted;
    v_pending := pg_catalog.array_remove(v_pending,v_table);
    v_guard := v_guard+1;
    if v_guard > 100 then
      raise exception using errcode='54000', message='workspace_deletion_dependency_guard';
    end if;
  end loop;

  perform pg_catalog.set_config('financial_app.workspace_delete_intent_id',p_intent_id::text,true);
  perform pg_catalog.set_config('financial_app.workspace_delete_execution_nonce',p_execution_nonce::text,true);

  delete from financial_app.transaction_source_records
  where workspace_id=v_workspace_id;
  get diagnostics v_last_deleted = row_count;
  v_deleted_rows := v_deleted_rows + v_last_deleted;

  if exists (
    select 1 from financial_app.transaction_source_records where workspace_id=v_workspace_id
  ) then
    raise exception using errcode='55000', message='workspace_deletion_bank_copy_residue';
  end if;

  v_completed_at := now();
  v_expires_at := v_completed_at + (v_policy.deletion_receipt_retention_days * interval '1 day');

  insert into financial_app.workspace_deletion_receipts(
    intent_id,deleted_workspace_id,requested_by_user_id,policy_version,retention_days,
    summary,completed_at,expires_at
  ) values (
    v_intent.id,v_workspace_id,v_user_id,v_policy.policy_version,
    v_policy.deletion_receipt_retention_days,
    pg_catalog.jsonb_build_object(
      'impactSummary',v_intent.impact_snapshot->'summary',
      'localRowsDeleted',v_deleted_rows,
      'officialBankSource','untouched',
      'googleDriveFiles','untouched',
      'supabaseStorageCleanupVerified',true,
      'oauthVaultCleanupVerified',true
    ),
    v_completed_at,v_expires_at
  ) returning id into v_receipt_id;

  update financial_app.workspace_deletion_intents
  set status='completed',last_error_code=null,updated_at=now()
  where id=v_intent.id;

  delete from financial_app.workspaces where id=v_workspace_id;
  get diagnostics v_root_deleted = row_count;
  if v_root_deleted <> 1 then
    raise exception using errcode='P0002', message='workspace_deletion_root_not_found';
  end if;

  for v_table in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='financial_app' and c.column_name='workspace_id'
  loop
    execute pg_catalog.format(
      'select count(*)::bigint from financial_app.%I where workspace_id=$1',v_table
    ) into v_count using v_workspace_id;
    if v_count <> 0 then
      raise exception using errcode='55000', message='workspace_deletion_local_residue:' || v_table;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,
    'intentId',p_intent_id,
    'status','completed',
    'receipt',pg_catalog.jsonb_build_object(
      'receiptId',v_receipt_id,
      'policyVersion',v_policy.policy_version,
      'retentionDays',v_policy.deletion_receipt_retention_days,
      'completedAt',v_completed_at,
      'expiresAt',v_expires_at
    ),
    'preservedExternalSources',pg_catalog.jsonb_build_object(
      'officialBankSource','untouched',
      'googleDriveFiles','untouched'
    ),
    'destructiveOperationExecuted',true
  );
end;
$$;

comment on function financial_app.begin_workspace_deletion_execution(uuid) is
  'CR-001A fail-closed transition confirmed -> executing. Refuses execution until retention and activation policy are explicitly approved.';
comment on function financial_app.record_workspace_deletion_external_cleanup(uuid,uuid,boolean,boolean) is
  'CR-001A records trusted Edge verification of Supabase Storage and OAuth Vault cleanup before local deletion.';
comment on function financial_app.finalize_workspace_deletion_local(uuid,uuid) is
  'CR-001A narrow SECURITY DEFINER local purge. It never mutates the official bank source or external Google Drive files.';

revoke all on function financial_app.begin_workspace_deletion_execution(uuid) from public,anon,authenticated,service_role;
revoke all on function financial_app.record_workspace_deletion_external_cleanup(uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function financial_app.finalize_workspace_deletion_local(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function financial_app.begin_workspace_deletion_execution(uuid) to financial_app_gateway;
grant execute on function financial_app.record_workspace_deletion_external_cleanup(uuid,uuid,boolean,boolean) to financial_app_gateway;
grant execute on function financial_app.finalize_workspace_deletion_local(uuid,uuid) to financial_app_gateway;

revoke update,delete on table financial_app.transaction_source_records from financial_app_gateway;
