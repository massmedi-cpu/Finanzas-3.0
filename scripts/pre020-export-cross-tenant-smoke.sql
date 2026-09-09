-- PRE-020B · exportación estructurada cross-tenant
-- Ejecutar sólo sobre la base PostgreSQL 17 desechable preparada por PRE-001.
\set ON_ERROR_STOP on

begin;

insert into financial_app.workspaces(id,name)
values
  ('a1000000-0000-4000-8000-000000000001'::uuid,'PRE020 export tenant A'),
  ('b2000000-0000-4000-8000-000000000002'::uuid,'PRE020 export tenant B');

insert into financial_app.accounts(
  id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values
  (
    'a1100000-0000-4000-8000-000000000011'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'PRE020 EXPORT ONLY A','Synthetic A','checking',111111,'EUR','active',0
  ),
  (
    'b2100000-0000-4000-8000-000000000021'::uuid,
    'b2000000-0000-4000-8000-000000000002'::uuid,
    'PRE020 EXPORT ONLY B','Synthetic B','checking',222222,'EUR','active',0
  );

insert into financial_app.transaction_source_records(
  id,workspace_id,source_file_id,source_sheet_id,source_row_key,source_fingerprint,
  source_payload,bank_date,concept_original,amount_cents,balance_after_cents,
  account_external_key,source_row_identity
) values
  (
    'a1200000-0000-4000-8000-000000000012'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'pre020-source-a','sheet-a','PRE020-A-ROW',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01',
    '{"synthetic":true,"tenant":"A","marker":"PRE020 EXPORT PAYLOAD A"}'::jsonb,
    date '2026-09-09','PRE020 EXPORT MOVEMENT A',-1111,109999,'pre020-a','pre020-row-a'
  ),
  (
    'b2200000-0000-4000-8000-000000000022'::uuid,
    'b2000000-0000-4000-8000-000000000002'::uuid,
    'pre020-source-b','sheet-b','PRE020-B-ROW',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02',
    '{"synthetic":true,"tenant":"B","marker":"PRE020 EXPORT PAYLOAD B"}'::jsonb,
    date '2026-09-09','PRE020 EXPORT MOVEMENT B',-2222,219999,'pre020-b','pre020-row-b'
  );

insert into financial_app.transactions(
  id,workspace_id,source_record_id,account_id,bank_date,concept_normalized,
  merchant_id,category_id,kind,amount_cents,balance_after_cents,
  review_state,duplicate_state,transfer_pair_id,source_row_identity
) values
  (
    'a1300000-0000-4000-8000-000000000013'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a1200000-0000-4000-8000-000000000012'::uuid,
    'a1100000-0000-4000-8000-000000000011'::uuid,
    date '2026-09-09','pre020 export movement a',null,null,'expense',-1111,109999,
    'confirmed','none',null,'pre020-row-a'
  ),
  (
    'b2300000-0000-4000-8000-000000000023'::uuid,
    'b2000000-0000-4000-8000-000000000002'::uuid,
    'b2200000-0000-4000-8000-000000000022'::uuid,
    'b2100000-0000-4000-8000-000000000021'::uuid,
    date '2026-09-09','pre020 export movement b',null,null,'expense',-2222,219999,
    'confirmed','none',null,'pre020-row-b'
  );

set role financial_app_gateway;
select pg_catalog.set_config('financial_app.workspace_id','a1000000-0000-4000-8000-000000000001',false);
select pg_catalog.set_config('financial_app.user_id','a9000000-0000-4000-8000-000000000009',false);

do $$
declare
  v_export jsonb := financial_app.export_current_workspace_data();
  v_text text := v_export::text;
begin
  if v_export->>'workspaceId' <> 'a1000000-0000-4000-8000-000000000001' then
    raise exception 'PRE020_EXPORT_A_WORKSPACE_ID_MISMATCH:%',v_export->>'workspaceId';
  end if;
  if jsonb_array_length(v_export#>'{datasets,accounts}') <> 1 then
    raise exception 'PRE020_EXPORT_A_ACCOUNT_COUNT:%',jsonb_array_length(v_export#>'{datasets,accounts}');
  end if;
  if jsonb_array_length(v_export#>'{datasets,transactionSourceRecords}') <> 1 then
    raise exception 'PRE020_EXPORT_A_SOURCE_COUNT:%',jsonb_array_length(v_export#>'{datasets,transactionSourceRecords}');
  end if;
  if jsonb_array_length(v_export#>'{datasets,transactions}') <> 1 then
    raise exception 'PRE020_EXPORT_A_TRANSACTION_COUNT:%',jsonb_array_length(v_export#>'{datasets,transactions}');
  end if;
  if position('PRE020 EXPORT ONLY A' in v_text) = 0
     or position('PRE020 EXPORT MOVEMENT A' in v_text) = 0
     or position('PRE020 EXPORT PAYLOAD A' in v_text) = 0 then
    raise exception 'PRE020_EXPORT_A_DATA_MISSING';
  end if;
  if position('PRE020 EXPORT ONLY B' in v_text) > 0
     or position('PRE020 EXPORT MOVEMENT B' in v_text) > 0
     or position('PRE020 EXPORT PAYLOAD B' in v_text) > 0
     or position('b2100000-0000-4000-8000-000000000021' in v_text) > 0 then
    raise exception 'PRE020_EXPORT_A_CROSS_TENANT_LEAK';
  end if;
  if (v_export->'datasets') ? 'google_oauth_connections'
     or (v_export->'datasets') ? 'authorized_users'
     or (v_export->'datasets') ? 'vault'
     or (v_export->'datasets') ? 'schema_meta' then
    raise exception 'PRE020_EXPORT_SENSITIVE_DATASET_EXPOSED';
  end if;
  if not (v_export->'limitations') ? 'document_binaries_not_included'
     or not (v_export->'limitations') ? 'oauth_credentials_not_included'
     or not (v_export->'limitations') ? 'vault_secrets_not_included' then
    raise exception 'PRE020_EXPORT_LIMITATIONS_MISSING';
  end if;
end
$$;

select pg_catalog.set_config('financial_app.workspace_id','b2000000-0000-4000-8000-000000000002',false);
select pg_catalog.set_config('financial_app.user_id','b9000000-0000-4000-8000-000000000009',false);

do $$
declare
  v_export jsonb := financial_app.export_current_workspace_data();
  v_text text := v_export::text;
begin
  if v_export->>'workspaceId' <> 'b2000000-0000-4000-8000-000000000002' then
    raise exception 'PRE020_EXPORT_B_WORKSPACE_ID_MISMATCH:%',v_export->>'workspaceId';
  end if;
  if jsonb_array_length(v_export#>'{datasets,accounts}') <> 1
     or jsonb_array_length(v_export#>'{datasets,transactionSourceRecords}') <> 1
     or jsonb_array_length(v_export#>'{datasets,transactions}') <> 1 then
    raise exception 'PRE020_EXPORT_B_COUNTS_INVALID';
  end if;
  if position('PRE020 EXPORT ONLY B' in v_text) = 0
     or position('PRE020 EXPORT MOVEMENT B' in v_text) = 0 then
    raise exception 'PRE020_EXPORT_B_DATA_MISSING';
  end if;
  if position('PRE020 EXPORT ONLY A' in v_text) > 0
     or position('PRE020 EXPORT MOVEMENT A' in v_text) > 0
     or position('a1100000-0000-4000-8000-000000000011' in v_text) > 0 then
    raise exception 'PRE020_EXPORT_B_CROSS_TENANT_LEAK';
  end if;
end
$$;

select pg_catalog.set_config('financial_app.workspace_id','',false);

do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform financial_app.export_current_workspace_data();
  exception when others then
    if sqlerrm = 'workspace_context_required' then
      v_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_blocked then raise exception 'PRE020_EXPORT_WITHOUT_WORKSPACE_ACCEPTED'; end if;
end
$$;

reset role;
rollback;

\echo PRE020_STRUCTURED_EXPORT_SMOKE_OK
