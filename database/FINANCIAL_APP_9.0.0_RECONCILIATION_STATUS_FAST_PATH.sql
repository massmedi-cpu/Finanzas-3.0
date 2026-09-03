-- Financial App 9.0.0 · Reconciliation status fast path
-- Materializes the canonical reconciliation state as a generated value so
-- bulk reads do not invoke effective_reconciliation_status(transactions)
-- for every wide transaction row. Source fields remain the only writable truth.

alter table financial_app.transactions
  add column if not exists reconciliation_status_effective text
  generated always as (
    case
      when is_reconciled is true then 'reconciled'
      when is_reconciled is false then 'not_reconciled'
      when lower(trim(coalesce(source_reconciled,''))) in ('sí','si','yes','true','1') then 'reconciled'
      when lower(trim(coalesce(source_reconciled,'')))='no aplica' then 'not_applicable'
      when lower(trim(coalesce(source_reconciled,'')))='pendiente' then 'pending'
      when lower(trim(coalesce(source_reconciled,''))) in ('no','false','0') then 'not_reconciled'
      else 'pending'
    end
  ) stored;

create index if not exists transactions_reconciliation_status_effective_idx
  on financial_app.transactions(reconciliation_status_effective);

comment on column financial_app.transactions.reconciliation_status_effective is
  'Generated read-only reconciliation state derived from is_reconciled/source_reconciled. Used by bulk read paths to avoid per-row composite function calls.';

create or replace function financial_app.home_pulse_core(
  p_month date default date_trunc('month',now())::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','financial_app','auth'
as $function$
declare
  v_start date:=date_trunc('month',p_month)::date;
  v_end date:=(date_trunc('month',p_month)+interval '1 month')::date;
  v_income numeric:=0;
  v_expenses numeric:=0;
  v_cash_flow numeric:=0;
  v_review integer:=0;
  v_review_source integer:=0;
  v_last_date date;
  v_reconciliation_total integer:=0;
  v_reconciled integer:=0;
  v_pending integer:=0;
  v_not_reconciled integer:=0;
  v_not_applicable integer:=0;
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
      t.reconciliation_status_effective as reconciliation_status,
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
    max(txn_date),
    count(*)::int,
    count(*) filter(where reconciliation_status='reconciled')::int,
    count(*) filter(where reconciliation_status='pending')::int,
    count(*) filter(where reconciliation_status='not_reconciled')::int,
    count(*) filter(where reconciliation_status='not_applicable')::int
  into
    v_income,v_expenses,v_cash_flow,v_review,v_review_source,v_last_date,
    v_reconciliation_total,v_reconciled,v_pending,v_not_reconciled,v_not_applicable
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
    'reconciliation',jsonb_build_object(
      'total',v_reconciliation_total,
      'reconciled',v_reconciled,
      'pending',v_pending,
      'notReconciled',v_not_reconciled,
      'notApplicable',v_not_applicable
    ),
    'sync',v_sync,
    'driveSync',v_drive_sync,
    'rules',jsonb_build_object(
      'readOnly',true,
      'singleTransactionPass',true,
      'accountsExcludedFromCriticalPath',true,
      'generatedReconciliationStatus',true
    )
  );
end;
$function$;

create or replace function financial_app.reconciliation_summary_core()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_summary jsonb;
begin
  if v_email is null then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select jsonb_build_object(
    'total',count(*),
    'reconciled',count(*) filter(where reconciliation_status_effective='reconciled'),
    'pending',count(*) filter(where reconciliation_status_effective='pending'),
    'notReconciled',count(*) filter(where reconciliation_status_effective='not_reconciled'),
    'notApplicable',count(*) filter(where reconciliation_status_effective='not_applicable')
  )
  into v_summary
  from financial_app.transactions;

  return v_summary;
end;
$function$;

comment on function financial_app.reconciliation_summary_core() is
  'Read-only reconciliation summary using generated canonical status; avoids per-row wide composite function evaluation.';
