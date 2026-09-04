begin;

do $$
declare
  v_account_id uuid;
  v_row record;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d uuid;
begin
  v_account_id := financial_app.ensure_source_account_mapping(
    '__duplicate_revision_regression__',
    'Cuenta duplicados',
    'Cuenta duplicados',
    'Banco prueba',
    'checking',
    0,
    '****0099'
  );

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','A','__duplicate_revision_regression__::sheet-1::A',repeat('a',64),
    '{"ID origen":"A"}'::jsonb,'2026-09-02','COMPRA DUPLICADA','COMPRA DUPLICADA',-1200,8800,
    'Cuenta duplicados','expense','pending','2026-09-04T11:40:00Z'
  );
  v_a := v_row.transaction_id;

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','B','__duplicate_revision_regression__::sheet-1::B',repeat('b',64),
    '{"ID origen":"B"}'::jsonb,'2026-09-02','COMPRA DUPLICADA','COMPRA DUPLICADA',-1200,7600,
    'Cuenta duplicados','expense','pending','2026-09-04T11:41:00Z'
  );
  v_b := v_row.transaction_id;

  if (select duplicate_state from financial_app.transactions where id=v_a) <> 'suspected'
     or (select duplicate_state from financial_app.transactions where id=v_b) <> 'suspected' then
    raise exception 'duplicate_pair_not_suspected';
  end if;

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','A','__duplicate_revision_regression__::sheet-1::A',repeat('c',64),
    '{"ID origen":"A","corregido":true}'::jsonb,'2026-09-02','COMPRA CORREGIDA','COMPRA CORREGIDA',-1300,8700,
    'Cuenta duplicados','expense','needs_review','2026-09-04T11:42:00Z'
  );

  if v_row.action <> 'append_revision' or v_row.transaction_id <> v_a then
    raise exception 'duplicate_revision_identity_failed';
  end if;
  if (select duplicate_state from financial_app.transactions where id=v_a) <> 'none' then
    raise exception 'revised_transaction_suspicion_not_cleared';
  end if;
  if (select duplicate_state from financial_app.transactions where id=v_b) <> 'none' then
    raise exception 'old_signature_suspicion_not_cleared';
  end if;

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','C','__duplicate_revision_regression__::sheet-1::C',repeat('d',64),
    '{"ID origen":"C"}'::jsonb,'2026-09-03','RECIBO DUPLICADO','RECIBO DUPLICADO',-2500,6200,
    'Cuenta duplicados','expense','pending','2026-09-04T11:43:00Z'
  );
  v_c := v_row.transaction_id;

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','D','__duplicate_revision_regression__::sheet-1::D',repeat('e',64),
    '{"ID origen":"D"}'::jsonb,'2026-09-03','RECIBO DUPLICADO','RECIBO DUPLICADO',-2500,3700,
    'Cuenta duplicados','expense','pending','2026-09-04T11:44:00Z'
  );
  v_d := v_row.transaction_id;

  update financial_app.transactions set duplicate_state='confirmed' where id=v_d;

  select * into v_row from financial_app.ingest_source_observation(
    '__duplicate_revision_regression__','sheet-1','C','__duplicate_revision_regression__::sheet-1::C',repeat('f',64),
    '{"ID origen":"C","corregido":true}'::jsonb,'2026-09-03','RECIBO CORREGIDO','RECIBO CORREGIDO',-2600,6100,
    'Cuenta duplicados','expense','pending','2026-09-04T11:45:00Z'
  );

  if (select duplicate_state from financial_app.transactions where id=v_c) <> 'none' then
    raise exception 'revised_confirmed_pair_suspicion_not_cleared';
  end if;
  if (select duplicate_state from financial_app.transactions where id=v_d) <> 'confirmed' then
    raise exception 'confirmed_duplicate_was_overwritten';
  end if;
end $$;

rollback;
