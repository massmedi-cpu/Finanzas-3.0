-- Financial App · hotfix 15/09/2026 · sincronización de fuente inmutable
--
-- transaction_source_records es append-only por diseño. El rol RLS del gateway no debe
-- disponer de UPDATE/DELETE. SELECT ... FOR UPDATE sobre esa tabla exigía privilegio UPDATE
-- incluso cuando sólo se pretendía serializar revisiones, provocando que el batch real
-- fallase antes de poder comparar o insertar una revisión.
--
-- Serializamos por source_row_identity con un advisory lock transaccional. Así mantenemos
-- la cadena de revisiones determinista sin relajar la inmutabilidad de la fuente bancaria.

create or replace function financial_app.ingest_source_observation(
  p_source_file_id text,
  p_source_sheet_id text,
  p_source_row_key text,
  p_source_row_identity text,
  p_source_fingerprint text,
  p_source_payload jsonb,
  p_bank_date date,
  p_concept_original text,
  p_concept_normalized text,
  p_amount_cents bigint,
  p_balance_after_cents bigint,
  p_account_external_key text,
  p_transaction_kind text,
  p_review_state text,
  p_imported_at timestamptz default now()
)
returns table(action text, source_record_id uuid, transaction_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_existing_source_id uuid;
  v_latest_source_id uuid;
  v_latest_payload jsonb;
  v_new_source_id uuid;
  v_transaction_id uuid;
  v_expected_identity text;
  v_old_account_id uuid;
  v_old_bank_date date;
  v_old_amount_cents bigint;
  v_old_concept text;
begin
  if p_source_payload is null or jsonb_typeof(p_source_payload) <> 'object' then
    raise exception 'invalid_source_payload';
  end if;
  if p_source_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_source_fingerprint';
  end if;
  if p_transaction_kind not in ('income','expense','transfer','refund','adjustment') then
    raise exception 'invalid_transaction_kind';
  end if;
  if p_review_state not in ('confirmed','pending','needs_review') then
    raise exception 'invalid_review_state';
  end if;

  v_expected_identity := btrim(p_source_file_id)||'::'||btrim(coalesce(p_source_sheet_id,''))||'::'||btrim(p_source_row_key);
  if p_source_row_identity <> v_expected_identity then
    raise exception 'source_row_identity_mismatch';
  end if;

  select account_id into v_account_id
  from financial_app.account_source_mappings
  where source_file_id=p_source_file_id
    and account_external_key=p_account_external_key;
  if v_account_id is null then
    raise exception 'source_account_unmapped';
  end if;

  -- Una única revisión lógica por identidad puede decidir/insertar a la vez.
  -- El lock vive sólo hasta el final de la transacción y no otorga capacidad de UPDATE.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_source_row_identity, 0)
  );

  select id into v_existing_source_id
  from financial_app.transaction_source_records
  where source_row_identity=p_source_row_identity
    and source_fingerprint=p_source_fingerprint
  limit 1;

  if v_existing_source_id is not null then
    select id into v_transaction_id
    from financial_app.transactions
    where source_row_identity=p_source_row_identity;

    action := 'skip';
    source_record_id := v_existing_source_id;
    transaction_id := v_transaction_id;
    return next;
    return;
  end if;

  -- La fuente es inmutable: lectura normal tras el advisory lock, nunca row-lock UPDATE.
  select id,source_payload into v_latest_source_id,v_latest_payload
  from financial_app.transaction_source_records
  where source_row_identity=p_source_row_identity
  order by imported_at desc,id desc
  limit 1;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
    supersedes_source_record_id,source_payload,bank_date,concept_original,amount_cents,
    balance_after_cents,account_external_key,imported_at
  ) values (
    p_source_file_id,p_source_sheet_id,p_source_row_key,p_source_row_identity,p_source_fingerprint,
    v_latest_source_id,p_source_payload,p_bank_date,btrim(p_concept_original),p_amount_cents,
    p_balance_after_cents,p_account_external_key,p_imported_at
  ) returning id into v_new_source_id;

  select id,account_id,bank_date,amount_cents,concept_normalized
  into v_transaction_id,v_old_account_id,v_old_bank_date,v_old_amount_cents,v_old_concept
  from financial_app.transactions
  where source_row_identity=p_source_row_identity
  for update;

  if v_transaction_id is null then
    insert into financial_app.transactions(
      source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
      kind,amount_cents,balance_after_cents,review_state
    ) values (
      v_new_source_id,p_source_row_identity,v_account_id,p_bank_date,btrim(p_concept_normalized),
      p_transaction_kind,p_amount_cents,p_balance_after_cents,p_review_state
    ) returning id into v_transaction_id;
    action := 'insert';
  else
    update financial_app.transactions
    set source_record_id=v_new_source_id,
        account_id=v_account_id,
        bank_date=p_bank_date,
        concept_normalized=btrim(p_concept_normalized),
        kind=p_transaction_kind,
        amount_cents=p_amount_cents,
        balance_after_cents=p_balance_after_cents,
        review_state=p_review_state,
        updated_at=now()
    where id=v_transaction_id;

    insert into financial_app.audit_changes(
      entity_type,entity_id,field_name,original_value,new_value,change_origin
    ) values (
      'transaction',v_transaction_id,'source_revision',v_latest_payload,p_source_payload,'source_sync'
    );
    action := 'append_revision';
  end if;

  if v_old_account_id is not null and (
    v_old_account_id is distinct from v_account_id
    or v_old_bank_date is distinct from p_bank_date
    or v_old_amount_cents is distinct from p_amount_cents
    or financial_app.normalize_label(v_old_concept) is distinct from financial_app.normalize_label(p_concept_normalized)
  ) then
    perform financial_app.recompute_duplicate_signature(
      v_old_account_id,v_old_bank_date,v_old_amount_cents,v_old_concept
    );
  end if;

  perform financial_app.recompute_duplicate_signature(
    v_account_id,p_bank_date,p_amount_cents,btrim(p_concept_normalized)
  );

  source_record_id := v_new_source_id;
  transaction_id := v_transaction_id;
  return next;
end;
$$;

-- Reafirmar el contrato append-only como defensa en profundidad.
revoke update, delete on table financial_app.transaction_source_records from financial_app_gateway;
revoke update, delete on table financial_app.transaction_source_records from service_role;

-- CREATE OR REPLACE conserva ACL, pero fijamos explícitamente la superficie esperada.
revoke all on function financial_app.ingest_source_observation(text,text,text,text,text,jsonb,date,text,text,bigint,bigint,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function financial_app.ingest_source_observation(text,text,text,text,text,jsonb,date,text,text,bigint,bigint,text,text,text,timestamptz)
to financial_app_gateway, service_role;

do $$
begin
  if has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','UPDATE')
     or has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','DELETE') then
    raise exception 'source_immutability_gateway_privilege_regression';
  end if;
  if has_table_privilege('service_role','financial_app.transaction_source_records','UPDATE')
     or has_table_privilege('service_role','financial_app.transaction_source_records','DELETE') then
    raise exception 'source_immutability_service_role_privilege_regression';
  end if;
end
$$;