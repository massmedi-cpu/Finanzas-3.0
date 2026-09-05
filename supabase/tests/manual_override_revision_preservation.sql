begin;

do $$
declare
  v_source constant text := '__manual_override_revision_regression__';
  v_account_key constant text := 'Cuenta overrides prueba';
  v_account_id uuid;
  v_first record;
  v_revision record;
begin
  v_account_id := financial_app.ensure_source_account_mapping(
    v_source,
    v_account_key,
    v_account_key,
    'Banco prueba',
    'checking',
    0,
    'active',
    '****0098'
  );

  select * into v_first from financial_app.ingest_source_observation(
    v_source,'sheet-1','ROW-1',v_source||'::sheet-1::ROW-1',repeat('a',64),
    '{"ID origen":"ROW-1","version":1}'::jsonb,'2026-09-04','ORIGINAL','ORIGINAL',-1000,9000,
    v_account_key,'expense','pending','2026-09-04T19:20:00Z'
  );
  if v_first.action <> 'insert' or v_first.transaction_id is null then
    raise exception 'initial_ingest_failed';
  end if;

  insert into financial_app.transaction_overrides(
    transaction_id,concept_override,excluded_from_analytics,review_state_override,note
  ) values (
    v_first.transaction_id,'CONCEPTO MANUAL',true,'confirmed','override regression'
  );

  select * into v_revision from financial_app.ingest_source_observation(
    v_source,'sheet-1','ROW-1',v_source||'::sheet-1::ROW-1',repeat('b',64),
    '{"ID origen":"ROW-1","version":2,"corrected":true}'::jsonb,'2026-09-04','ORIGINAL CORREGIDO','ORIGINAL CORREGIDO',-1100,8900,
    v_account_key,'expense','needs_review','2026-09-04T19:21:00Z'
  );

  if v_revision.action <> 'append_revision' then
    raise exception 'revision_not_appended';
  end if;
  if v_revision.transaction_id <> v_first.transaction_id then
    raise exception 'transaction_identity_changed_across_revision';
  end if;
  if (select count(*) from financial_app.transaction_source_records where source_file_id=v_source) <> 2 then
    raise exception 'source_revision_history_not_preserved';
  end if;
  if not exists (
    select 1 from financial_app.transaction_overrides
    where transaction_id=v_first.transaction_id
      and concept_override='CONCEPTO MANUAL'
      and excluded_from_analytics=true
      and review_state_override='confirmed'
      and note='override regression'
  ) then
    raise exception 'manual_override_not_preserved';
  end if;
  if (select lifecycle from financial_app.accounts where id=v_account_id) <> 'active' then
    raise exception 'source_account_lifecycle_not_preserved';
  end if;
end $$;

rollback;
