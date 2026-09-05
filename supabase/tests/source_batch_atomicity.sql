begin;

do $$
declare
  v_run_id uuid;
  v_failed_run_id uuid;
  v_count integer;
begin
  if exists (select 1 from financial_app.account_source_mappings where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.transaction_source_records where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.sync_runs where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.sync_cursors where source_file_id='__phase2_atomicity_regression__') then
    raise exception 'dirty_atomicity_baseline';
  end if;

  begin
    insert into financial_app.sync_runs(
      source_file_id,source_revision,status,rows_seen,schema_fingerprint
    ) values (
      '__phase2_atomicity_regression__','drive-version:test','started',2,repeat('d',64)
    ) returning id into v_run_id;

    perform financial_app.ensure_source_account_mapping(
      '__phase2_atomicity_regression__',
      'Cuenta atomicidad',
      'Cuenta atomicidad',
      'Banco prueba',
      'checking',
      0,
      'active',
      '****0002'
    );

    perform 1
    from financial_app.ingest_source_observation(
      '__phase2_atomicity_regression__','sheet-atomic','ROW-1',
      '__phase2_atomicity_regression__::sheet-atomic::ROW-1',repeat('a',64),
      '{"ID origen":"ROW-1"}'::jsonb,
      '2026-09-05'::date,'ATOMICIDAD 1','ATOMICIDAD 1',-100,900,
      'Cuenta atomicidad','expense','pending',now()
    );

    raise exception 'synthetic_mid_batch_failure';
  exception when others then
    if sqlerrm <> 'synthetic_mid_batch_failure' then
      raise;
    end if;
  end;

  select count(*) into v_count from financial_app.account_source_mappings where source_file_id='__phase2_atomicity_regression__';
  if v_count <> 0 then raise exception 'mapping_not_rolled_back'; end if;

  select count(*) into v_count from financial_app.transaction_source_records where source_file_id='__phase2_atomicity_regression__';
  if v_count <> 0 then raise exception 'source_records_not_rolled_back'; end if;

  select count(*) into v_count
  from financial_app.transactions t
  where t.source_row_identity like '__phase2_atomicity_regression__::%';
  if v_count <> 0 then raise exception 'transactions_not_rolled_back'; end if;

  select count(*) into v_count from financial_app.sync_runs where source_file_id='__phase2_atomicity_regression__';
  if v_count <> 0 then raise exception 'started_run_not_rolled_back'; end if;

  select count(*) into v_count from financial_app.sync_cursors where source_file_id='__phase2_atomicity_regression__';
  if v_count <> 0 then raise exception 'cursors_not_rolled_back'; end if;

  insert into financial_app.sync_runs(
    source_file_id,source_revision,status,finished_at,rows_seen,rows_failed,schema_fingerprint,error_code,error_message
  ) values (
    '__phase2_atomicity_regression__','drive-version:test','failed',now(),2,2,repeat('d',64),
    'synthetic_mid_batch_failure','El batch atómico se ha revertido por completo.'
  ) returning id into v_failed_run_id;

  if not exists (
    select 1 from financial_app.sync_runs
    where id=v_failed_run_id and status='failed' and rows_seen=2 and rows_failed=2
      and error_code='synthetic_mid_batch_failure'
  ) then
    raise exception 'failed_run_not_recorded';
  end if;

  if exists (select 1 from financial_app.account_source_mappings where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.transaction_source_records where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.sync_cursors where source_file_id='__phase2_atomicity_regression__')
     or exists (select 1 from financial_app.transactions where source_row_identity like '__phase2_atomicity_regression__::%') then
    raise exception 'partial_batch_residue_after_failed_run';
  end if;
end $$;

rollback;
