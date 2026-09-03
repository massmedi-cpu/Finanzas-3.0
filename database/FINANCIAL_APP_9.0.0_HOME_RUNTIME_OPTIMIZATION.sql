-- Financial App 9.0.0 · Home runtime optimization
-- Reuses the existing Home transaction pass for reconciliation and introduces
-- a narrow account snapshot for the landing page. Full Accounts and
-- Reconciliation RPCs remain unchanged for their dedicated routes.

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
      financial_app.effective_reconciliation_status(t) as reconciliation_status,
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
      'accountsExcludedFromCriticalPath',true
    )
  );
end;
$function$;

create or replace function financial_app.home_accounts_core()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','financial_app','auth'
as $function$
declare
  v_month date:=date_trunc('month',now())::date;
  v_accounts jsonb:='[]'::jsonb;
begin
  if not financial_app.current_user_allowed() then
    raise exception 'forbidden' using errcode='42501';
  end if;

  with base as (
    select
      a.id,
      a.name,
      a.external_identifier,
      a.account_role,
      current_balance.source_balance as balance,
      current_balance.source_date as balance_date,
      previous_balance.source_balance as previous_balance
    from financial_app.accounts a
    left join lateral (
      select t.source_balance,t.source_date
      from financial_app.transactions t
      where t.account_id=a.id
        and t.source_identifier=a.external_identifier
        and t.source_missing=false
        and t.source_balance is not null
      order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc
      limit 1
    ) current_balance on true
    left join lateral (
      select t.source_balance
      from financial_app.transactions t
      where t.account_id=a.id
        and t.source_identifier=a.external_identifier
        and t.source_missing=false
        and t.source_balance is not null
        and t.source_date<v_month
      order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc
      limit 1
    ) previous_balance on true
    where a.active=true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'name',name,
    'identifier',external_identifier,
    'role',account_role,
    'balance',balance,
    'balanceDate',balance_date,
    'previousBalance',previous_balance
  ) order by case when account_role='operating' then 0 when account_role='savings' then 1 else 2 end,name),'[]'::jsonb)
  into v_accounts
  from base;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'month',to_char(v_month,'YYYY-MM'),
    'accounts',v_accounts
  );
end;
$function$;

revoke all on function financial_app.home_accounts_core() from public,anon;
grant execute on function financial_app.home_accounts_core() to authenticated,service_role;

create or replace function public.financial_app_home_accounts()
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','financial_app'
as $function$
  select financial_app.home_accounts_core()
$function$;

revoke all on function public.financial_app_home_accounts() from public,anon;
grant execute on function public.financial_app_home_accounts() to authenticated,service_role;

comment on function public.financial_app_home_accounts() is
  'Read-only lightweight account snapshot for Financial App Home. Full Accounts RPC remains canonical for /cuentas.';
