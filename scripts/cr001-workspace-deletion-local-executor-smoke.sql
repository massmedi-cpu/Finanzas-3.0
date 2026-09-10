-- CR-001A · prueba destructiva exclusivamente en DB desechable y ROLLBACK.
-- Valida policy fail-closed, owner-only, nonce, barrera de cleanup, excepción bancaria
-- estrecha, borrado local completo y aislamiento cross-tenant.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
  ('c1900000-0000-4000-8000-000000000001'::uuid),
  ('c1900000-0000-4000-8000-000000000002'::uuid);
insert into financial_app.workspaces(id,name) values
  ('c1100000-0000-4000-8000-000000000001'::uuid,'CR001A tenant A'),
  ('c1200000-0000-4000-8000-000000000002'::uuid,'CR001A tenant B');
insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default) values
  ('c1100000-0000-4000-8000-000000000001','c1900000-0000-4000-8000-000000000001','owner',true,false),
  ('c1200000-0000-4000-8000-000000000002','c1900000-0000-4000-8000-000000000002','owner',true,false);
insert into financial_app.accounts(id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order) values
  ('c1110000-0000-4000-8000-000000000011','c1100000-0000-4000-8000-000000000001','CR001A account A','Synthetic A','checking',10000,'EUR','active',0),
  ('c1210000-0000-4000-8000-000000000021','c1200000-0000-4000-8000-000000000002','CR001A account B','Synthetic B','checking',20000,'EUR','active',0);
insert into financial_app.transaction_source_records(
  id,workspace_id,source_file_id,source_sheet_id,source_row_key,source_fingerprint,
  source_payload,bank_date,concept_original,amount_cents,balance_after_cents,
  account_external_key,source_row_identity
) values
  ('c1120000-0000-4000-8000-000000000012','c1100000-0000-4000-8000-000000000001','cr001-a','sheet','1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"tenant":"A"}'::jsonb,date '2026-09-10','CR001 A',-100,9900,'a','cr001-a-1'),
  ('c1220000-0000-4000-8000-000000000022','c1200000-0000-4000-8000-000000000002','cr001-b','sheet','1','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{"tenant":"B"}'::jsonb,date '2026-09-10','CR001 B',-200,19800,'b','cr001-b-1');
insert into financial_app.transactions(
  id,workspace_id,source_record_id,account_id,bank_date,concept_normalized,kind,amount_cents,
  balance_after_cents,review_state,duplicate_state,source_row_identity
) values
  ('c1130000-0000-4000-8000-000000000013','c1100000-0000-4000-8000-000000000001','c1120000-0000-4000-8000-000000000012','c1110000-0000-4000-8000-000000000011',date '2026-09-10','cr001 a','expense',-100,9900,'confirmed','none','cr001-a-1'),
  ('c1230000-0000-4000-8000-000000000023','c1200000-0000-4000-8000-000000000002','c1220000-0000-4000-8000-000000000022','c1210000-0000-4000-8000-000000000021',date '2026-09-10','cr001 b','expense',-200,19800,'confirmed','none','cr001-b-1');

set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','c1100000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','c1900000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);

do $$
declare
  v_prepared jsonb;
  v_confirmed jsonb;
  v_blocked boolean:=false;
begin
  v_prepared:=financial_app.prepare_workspace_deletion_intent('c1300000-0000-4000-8000-000000000003'::uuid);
  v_confirmed:=financial_app.confirm_workspace_deletion_intent(
    (v_prepared->>'intentId')::uuid,(v_prepared->>'confirmationNonce')::uuid
  );
  if v_confirmed->>'status'<>'confirmed' then raise exception 'CR001A_CONFIRM_FAILED:%',v_confirmed; end if;
  begin
    perform financial_app.begin_workspace_deletion_execution((v_prepared->>'intentId')::uuid);
  exception when others then
    if sqlerrm='workspace_deletion_execution_policy_not_approved' then v_blocked:=true; else raise; end if;
  end;
  if not v_blocked then raise exception 'CR001A_DEFAULT_POLICY_NOT_FAIL_CLOSED'; end if;
end
$$;

reset role;
update financial_app.workspace_deletion_runtime_policy
set policy_version='cr001a-smoke-only',
    deletion_receipt_retention_days=30,
    retention_approved_at=now(),
    execution_enabled=true,
    activation_approved_at=now(),
    updated_at=now()
where id=true;

set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','c1100000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','c1900000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);

do $$
declare
  v_intent uuid;
  v_started jsonb;
  v_replay jsonb;
  v_nonce uuid;
  v_blocked boolean:=false;
  v_result jsonb;
begin
  select id into v_intent
  from financial_app.workspace_deletion_intents
  where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid and status='confirmed';

  v_started:=financial_app.begin_workspace_deletion_execution(v_intent);
  v_replay:=financial_app.begin_workspace_deletion_execution(v_intent);
  v_nonce:=(v_started->>'executionNonce')::uuid;
  if v_started->>'status'<>'executing'
     or (v_started->>'idempotentReplay')::boolean
     or not (v_replay->>'idempotentReplay')::boolean
     or (v_replay->>'executionNonce')::uuid<>v_nonce then
    raise exception 'CR001A_BEGIN_IDEMPOTENCY_INVALID start=% replay=%',v_started,v_replay;
  end if;

  begin
    perform financial_app.finalize_workspace_deletion_local(v_intent,v_nonce);
  exception when others then
    if sqlerrm='workspace_deletion_external_cleanup_not_verified' then v_blocked:=true; else raise; end if;
  end;
  if not v_blocked then raise exception 'CR001A_FINALIZE_BEFORE_CLEANUP_ALLOWED'; end if;

  perform financial_app.record_workspace_deletion_external_cleanup(v_intent,v_nonce,true,true);
  v_result:=financial_app.finalize_workspace_deletion_local(v_intent,v_nonce);
  if v_result->>'status'<>'completed'
     or not (v_result->>'destructiveOperationExecuted')::boolean
     or v_result#>>'{preservedExternalSources,officialBankSource}'<>'untouched'
     or v_result#>>'{preservedExternalSources,googleDriveFiles}'<>'untouched'
     or (v_result#>>'{receipt,retentionDays}')::int<>30 then
    raise exception 'CR001A_FINAL_RESULT_INVALID:%',v_result;
  end if;
end
$$;

reset role;

do $$
begin
  if exists (select 1 from financial_app.workspaces where id='c1100000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.workspace_memberships where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.accounts where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.transactions where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.transaction_source_records where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.workspace_deletion_intents where workspace_id='c1100000-0000-4000-8000-000000000001'::uuid) then
    raise exception 'CR001A_TARGET_RESIDUE';
  end if;

  if (select count(*) from financial_app.workspace_deletion_receipts where deleted_workspace_id='c1100000-0000-4000-8000-000000000001'::uuid)<>1 then
    raise exception 'CR001A_RECEIPT_MISSING';
  end if;

  if (select count(*) from financial_app.workspaces where id='c1200000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.accounts where workspace_id='c1200000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.transactions where workspace_id='c1200000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.transaction_source_records where workspace_id='c1200000-0000-4000-8000-000000000002'::uuid)<>1 then
    raise exception 'CR001A_CROSS_TENANT_DAMAGE';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='financial_app'
      and c.relname='transaction_source_records'
      and t.tgname='transaction_source_records_no_delete'
      and t.tgenabled='O'
      and not t.tgisinternal
  ) then raise exception 'CR001A_BANK_DELETE_TRIGGER_DAMAGED'; end if;
end
$$;

-- Incluso con GUC residuales del executor, otro workspace no puede usar la excepción.
do $$
declare v_blocked boolean:=false; begin
  begin
    delete from financial_app.transaction_source_records
    where workspace_id='c1200000-0000-4000-8000-000000000002'::uuid;
  exception when others then
    if sqlerrm='bank source records are immutable' then v_blocked:=true; else raise; end if;
  end;
  if not v_blocked then raise exception 'CR001A_BANK_TRIGGER_CROSS_TENANT_BYPASS'; end if;
end $$;

rollback;
\echo CR001_WORKSPACE_DELETION_LOCAL_EXECUTOR_SMOKE_OK
