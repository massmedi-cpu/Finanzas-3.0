begin;

do $$
declare
  account_id uuid;
  result_row record;
  v_transaction_id uuid;
  first_source_id uuid;
  revised_source_id uuid;
begin
  account_id := financial_app.ensure_source_account_mapping(
    '__phase2_regression__',
    'Cuenta prueba',
    'Cuenta prueba',
    'Banco prueba',
    'checking',
    0,
    '****0001'
  );

  select * into result_row
  from financial_app.ingest_source_observation(
    '__phase2_regression__','sheet-1','ROW-1','__phase2_regression__::sheet-1::ROW-1',repeat('a',64),
    '{"ID origen":"ROW-1","Categoría":"Origen A"}'::jsonb,
    '2026-09-01','COMPRA TEST','COMPRA TEST',-1000,9000,'Cuenta prueba','expense','pending','2026-09-04T09:00:00Z'
  );

  if result_row.action <> 'insert' then raise exception 'expected_insert'; end if;
  v_transaction_id := result_row.transaction_id;
  first_source_id := result_row.source_record_id;

  insert into financial_app.transaction_overrides(
    transaction_id,concept_override,note,review_state_override
  ) values (
    v_transaction_id,'CORRECCIÓN USUARIO','no perder','confirmed'
  );

  select * into result_row
  from financial_app.ingest_source_observation(
    '__phase2_regression__','sheet-1','ROW-1','__phase2_regression__::sheet-1::ROW-1',repeat('a',64),
    '{"ID origen":"ROW-1","Categoría":"Origen A"}'::jsonb,
    '2026-09-01','COMPRA TEST','COMPRA TEST',-1000,9000,'Cuenta prueba','expense','pending','2026-09-04T09:01:00Z'
  );

  if result_row.action <> 'skip'
     or result_row.transaction_id <> v_transaction_id
     or result_row.source_record_id <> first_source_id then
    raise exception 'idempotency_failed';
  end if;

  select * into result_row
  from financial_app.ingest_source_observation(
    '__phase2_regression__','sheet-1','ROW-1','__phase2_regression__::sheet-1::ROW-1',repeat('b',64),
    '{"ID origen":"ROW-1","Categoría":"Origen B"}'::jsonb,
    '2026-09-01','COMPRA TEST CORREGIDA','COMPRA TEST CORREGIDA',-1050,8950,'Cuenta prueba','expense','needs_review','2026-09-04T09:02:00Z'
  );

  if result_row.action <> 'append_revision'
     or result_row.transaction_id <> v_transaction_id
     or result_row.source_record_id = first_source_id then
    raise exception 'revision_identity_failed';
  end if;
  revised_source_id := result_row.source_record_id;

  if (select supersedes_source_record_id from financial_app.transaction_source_records where id=revised_source_id) <> first_source_id then
    raise exception 'source_history_failed';
  end if;
  if (select o.concept_override from financial_app.transaction_overrides o where o.transaction_id=v_transaction_id) <> 'CORRECCIÓN USUARIO' then
    raise exception 'override_lost';
  end if;
  if (select o.note from financial_app.transaction_overrides o where o.transaction_id=v_transaction_id) <> 'no perder' then
    raise exception 'override_note_lost';
  end if;
  if not exists(
    select 1 from financial_app.audit_changes
    where entity_id=v_transaction_id and field_name='source_revision' and change_origin='source_sync'
  ) then
    raise exception 'source_audit_missing';
  end if;

  select * into result_row
  from financial_app.ingest_source_observation(
    '__phase2_regression__','sheet-1','ROW-2','__phase2_regression__::sheet-1::ROW-2',repeat('c',64),
    '{"ID origen":"ROW-2"}'::jsonb,
    '2026-09-01','COMPRA TEST CORREGIDA','COMPRA TEST CORREGIDA',-1050,7900,'Cuenta prueba','expense','pending','2026-09-04T09:03:00Z'
  );

  if (select duplicate_state from financial_app.transactions where id=v_transaction_id) <> 'suspected' then
    raise exception 'duplicate_original_not_suspected';
  end if;
  if (select duplicate_state from financial_app.transactions where id=result_row.transaction_id) <> 'suspected' then
    raise exception 'duplicate_new_not_suspected';
  end if;

  begin
    update financial_app.transaction_source_records
    set concept_original='NO'
    where id=first_source_id;
    raise exception 'expected_source_update_rejection';
  exception when others then
    if sqlerrm='expected_source_update_rejection' then raise; end if;
    if position('immutable' in sqlerrm)=0 then raise; end if;
  end;
end $$;

rollback;
