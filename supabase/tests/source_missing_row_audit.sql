begin;

do $$
declare
  v_account_id uuid;
  v_first record;
  v_second record;
  v_run_id uuid;
  v_missing_count integer;
  v_present_count integer;
  v_warning_count integer;
  v_first_before jsonb;
  v_first_after jsonb;
begin
  v_account_id := financial_app.ensure_source_account_mapping(
    '__missing_row_regression__','Cuenta ausencia','Cuenta ausencia','Banco prueba','checking',0,'****0088'
  );

  select * into v_first from financial_app.ingest_source_observation(
    '__missing_row_regression__','sheet-1','ROW-A','__missing_row_regression__::sheet-1::ROW-A',repeat('1',64),
    '{"id":"ROW-A"}'::jsonb,'2026-09-01','MOVIMIENTO A','MOVIMIENTO A',-1000,9000,
    'Cuenta ausencia','expense','pending','2026-09-04T12:45:00Z'
  );
  select * into v_second from financial_app.ingest_source_observation(
    '__missing_row_regression__','sheet-1','ROW-B','__missing_row_regression__::sheet-1::ROW-B',repeat('2',64),
    '{"id":"ROW-B"}'::jsonb,'2026-09-02','MOVIMIENTO B','MOVIMIENTO B',-2000,7000,
    'Cuenta ausencia','expense','pending','2026-09-04T12:46:00Z'
  );

  select jsonb_build_object(
    'id',t.id,'source_record_id',t.source_record_id,'bank_date',t.bank_date,'concept',t.concept_normalized,
    'amount',t.amount_cents,'balance',t.balance_after_cents,'review_state',t.review_state,'duplicate_state',t.duplicate_state
  ) into v_first_before
  from financial_app.transactions t where t.id=v_first.transaction_id;

  insert into financial_app.sync_runs(source_file_id,source_revision,status,rows_seen,schema_fingerprint)
  values('__missing_row_regression__','rev-2','started',1,repeat('a',64)) returning id into v_run_id;

  with missing as (
    select t.id as transaction_id,sr.source_sheet_id,sr.source_row_key,t.source_row_identity
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    where sr.source_file_id='__missing_row_regression__'
      and not (t.source_row_identity = any(array['__missing_row_regression__::sheet-1::ROW-B']::text[]))
  )
  select count(*)::int into v_missing_count from missing;

  if v_missing_count <> 1 then
    raise exception 'missing_row_detection_expected_1_got_%',v_missing_count;
  end if;

  insert into financial_app.sync_issues(
    sync_run_id,severity,issue_code,source_sheet_id,source_row_key,field_name,message,details
  )
  select v_run_id,'warning','source_row_missing_from_snapshot',sr.source_sheet_id,sr.source_row_key,null,
         'Una fila importada anteriormente ya no aparece en la fotografía completa de la fuente oficial.',
         jsonb_build_object('transactionId',t.id,'sourceRowIdentity',t.source_row_identity,'sourceRevision','rev-2')
  from financial_app.transactions t
  join financial_app.transaction_source_records sr on sr.id=t.source_record_id
  where sr.source_file_id='__missing_row_regression__'
    and not (t.source_row_identity = any(array['__missing_row_regression__::sheet-1::ROW-B']::text[]));

  update financial_app.sync_runs
  set status='success',finished_at=now(),rows_skipped=1,warnings_count=v_missing_count
  where id=v_run_id;

  select count(*)::int into v_warning_count from financial_app.sync_issues
  where sync_run_id=v_run_id and issue_code='source_row_missing_from_snapshot' and severity='warning';
  if v_warning_count <> 1 then
    raise exception 'missing_row_warning_not_recorded';
  end if;

  select jsonb_build_object(
    'id',t.id,'source_record_id',t.source_record_id,'bank_date',t.bank_date,'concept',t.concept_normalized,
    'amount',t.amount_cents,'balance',t.balance_after_cents,'review_state',t.review_state,'duplicate_state',t.duplicate_state
  ) into v_first_after
  from financial_app.transactions t where t.id=v_first.transaction_id;
  if v_first_after is distinct from v_first_before then
    raise exception 'missing_row_audit_modified_transaction';
  end if;

  if not exists (
    select 1 from financial_app.transaction_source_records
    where id=v_first.source_record_id and source_row_identity='__missing_row_regression__::sheet-1::ROW-A'
  ) then
    raise exception 'missing_row_audit_deleted_source_record';
  end if;

  with missing as (
    select t.id
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    where sr.source_file_id='__missing_row_regression__'
      and not (t.source_row_identity = any(array[
        '__missing_row_regression__::sheet-1::ROW-A',
        '__missing_row_regression__::sheet-1::ROW-B'
      ]::text[]))
  )
  select count(*)::int into v_present_count from missing;
  if v_present_count <> 0 then
    raise exception 'reappeared_row_still_marked_missing';
  end if;
end $$;

rollback;
