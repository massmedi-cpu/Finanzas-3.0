begin;

do $$
declare
  v_success_run_id uuid;
  v_failed_run_id uuid;
  v_latest_run_id uuid;
  v_cursor_run_id uuid;
  v_cursor_row text;
  v_cursor_revision text;
begin
  if exists (select 1 from financial_app.sync_runs where source_file_id='__phase2_failure_status_regression__')
     or exists (select 1 from financial_app.sync_cursors where source_file_id='__phase2_failure_status_regression__') then
    raise exception 'dirty_failure_status_baseline';
  end if;

  insert into financial_app.sync_runs(
    source_file_id,source_revision,status,started_at,finished_at,rows_seen,rows_inserted,rows_revised,
    rows_skipped,rows_failed,duplicates_detected,warnings_count,schema_fingerprint
  ) values (
    '__phase2_failure_status_regression__','drive-version:success','success',now()-interval '2 minutes',now()-interval '1 minute',
    10,10,0,0,0,0,0,repeat('e',64)
  ) returning id into v_success_run_id;

  insert into financial_app.sync_cursors(
    source_file_id,source_sheet_id,source_revision,last_source_row_key,last_successful_run_id,updated_at
  ) values (
    '__phase2_failure_status_regression__','sheet-status','drive-version:success','ROW-SUCCESS',v_success_run_id,now()-interval '1 minute'
  );

  insert into financial_app.sync_runs(
    source_file_id,source_revision,status,started_at,finished_at,rows_seen,rows_failed,schema_fingerprint,error_code,error_message
  ) values (
    '__phase2_failure_status_regression__','drive-version:failed','failed',now(),now(),10,10,repeat('f',64),
    'synthetic_failure','El batch atómico se ha revertido por completo.'
  ) returning id into v_failed_run_id;

  select id into v_latest_run_id
  from financial_app.sync_runs
  where source_file_id='__phase2_failure_status_regression__'
  order by started_at desc,id desc
  limit 1;

  if v_latest_run_id is distinct from v_failed_run_id then
    raise exception 'latest_attempt_is_not_failed_run';
  end if;

  select last_successful_run_id,last_source_row_key,source_revision
  into v_cursor_run_id,v_cursor_row,v_cursor_revision
  from financial_app.sync_cursors
  where source_file_id='__phase2_failure_status_regression__' and source_sheet_id='sheet-status';

  if v_cursor_run_id is distinct from v_success_run_id then
    raise exception 'failed_attempt_advanced_success_cursor';
  end if;
  if v_cursor_row is distinct from 'ROW-SUCCESS' then
    raise exception 'failed_attempt_changed_cursor_row';
  end if;
  if v_cursor_revision is distinct from 'drive-version:success' then
    raise exception 'failed_attempt_changed_cursor_revision';
  end if;
end $$;

rollback;
