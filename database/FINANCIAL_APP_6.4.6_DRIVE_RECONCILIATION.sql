begin;

-- Financial App 6.4.6 · reconciliación documental de Google Drive.
-- Problema medido: la migración inicial de Archivo v6 archivó documentos de
-- Drive después de que el cursor incremental ya estuviera inicializado. Como
-- los archivos seguían sin cambios en Drive, el cursor no volvió a emitirlos.
--
-- Regla canónica: NO se desarchivan documentos a ciegas. Se invalida una sola
-- vez el cursor de Drive y el siguiente sync autenticado hace un full scan; el
-- core existente reactiva solo los IDs que Google Drive confirma presentes.

do $$
declare
  v_checked boolean:=false;
begin
  select coalesce((value #>> '{}')::boolean,false)
    into v_checked
  from financial_app.app_meta
  where key='drive_reconciliation_v646_checked';

  if not coalesce(v_checked,false) then
    if exists(
      select 1
      from financial_app.document_history h
      join financial_app.documents d on d.id=h.document_id
      join financial_app.drive_sync_state s on s.id='documents'
      where h.action='archive_v6_migration'
        and d.storage_provider='google_drive'
        and d.archived_at is not null
        and h.changed_at>=coalesce(s.initialized_at,'-infinity'::timestamptz)
    ) then
      update financial_app.drive_sync_state
      set change_token=null,
          updated_at=now()
      where id='documents';
    end if;

    insert into financial_app.app_meta(key,value,updated_at)
    values('drive_reconciliation_v646_checked','true'::jsonb,now())
    on conflict(key) do update
      set value=excluded.value,
          updated_at=excluded.updated_at;
  end if;
end
$$;

-- El pulso de Inicio expone el estado del mismo cursor sin añadir una segunda
-- petición crítica. El cliente solo informa; no modifica Drive ni documentos.
create or replace function financial_app.home_pulse_core(
  p_month date default date_trunc('month',now())::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','financial_app','auth'
as $$
declare
  v_start date:=date_trunc('month',p_month)::date;
  v_end date:=(date_trunc('month',p_month)+interval '1 month')::date;
  v_income numeric:=0;
  v_expenses numeric:=0;
  v_cash_flow numeric:=0;
  v_review integer:=0;
  v_review_source integer:=0;
  v_last_date date;
  v_sync jsonb;
  v_drive_sync jsonb;
begin
  if not financial_app.current_user_allowed() then
    raise exception 'forbidden' using errcode='42501';
  end if;

  with tx as (
    select
      coalesce(t.effective_date,t.source_date) as txn_date,
      coalesce(t.personal_amount_override,t.source_amount) as amount,
      t.source_missing,
      t.is_duplicate,
      t.is_internal_transfer,
      t.cash_flow_override,
      t.needs_review,
      t.status,
      a.account_role,
      a.cash_flow_enabled
    from financial_app.transactions t
    left join financial_app.accounts a on a.id=t.account_id
  )
  select
    coalesce(sum(amount) filter(where txn_date>=v_start and txn_date<v_end and source_missing=false and is_duplicate=false and is_internal_transfer=false and account_role<>'savings' and cash_flow_enabled=true and cash_flow_override is distinct from false and amount>0),0),
    coalesce(abs(sum(amount) filter(where txn_date>=v_start and txn_date<v_end and source_missing=false and is_duplicate=false and is_internal_transfer=false and account_role<>'savings' and cash_flow_enabled=true and cash_flow_override is distinct from false and amount<0)),0),
    coalesce(sum(amount) filter(where txn_date>=v_start and txn_date<v_end and source_missing=false and is_duplicate=false and is_internal_transfer=false and account_role<>'savings' and cash_flow_enabled=true and cash_flow_override is distinct from false),0),
    count(*) filter(where needs_review=true)::int,
    count(*) filter(where status='review_source')::int,
    max(txn_date)
  into v_income,v_expenses,v_cash_flow,v_review,v_review_source,v_last_date
  from tx;

  select jsonb_build_object(
    'id',id,
    'startedAt',started_at,
    'finishedAt',finished_at,
    'sourceFileId',source_file_id,
    'sourceModifiedAt',source_modified_at,
    'status',status,
    'newCount',new_count,
    'updatedCount',updated_count,
    'reviewCount',review_count
  )
  into v_sync
  from financial_app.sync_runs
  where source_file_id is not null
  order by started_at desc
  limit 1;

  select jsonb_build_object(
    'reconciliationPending',change_token is null,
    'lastSyncAt',case when change_token is null then null else updated_at end,
    'lastMode',last_mode
  )
  into v_drive_sync
  from financial_app.drive_sync_state
  where id='documents';

  if v_drive_sync is null then
    v_drive_sync:=jsonb_build_object(
      'reconciliationPending',true,
      'lastSyncAt',null,
      'lastMode',null
    );
  end if;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'month',to_char(v_start,'YYYY-MM'),
    'income',v_income,
    'expenses',v_expenses,
    'cashFlow',v_cash_flow,
    'needsReview',v_review,
    'reviewSource',v_review_source,
    'lastMovementDate',v_last_date,
    'sync',v_sync,
    'driveSync',v_drive_sync,
    'rules',jsonb_build_object(
      'readOnly',true,
      'singleTransactionPass',true,
      'accountsExcludedFromCriticalPath',true
    )
  );
end;
$$;

commit;
