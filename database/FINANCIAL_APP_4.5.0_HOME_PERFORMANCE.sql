begin;

-- Financial App 4.5.0 — ruta crítica de Inicio y saldos optimizados.
-- Solo estructura/lectura: no modifica movimientos, saldos ni documentos.
create index if not exists transactions_latest_source_balance_idx
on financial_app.transactions (
  source_identifier,
  source_date desc nulls last,
  source_time desc nulls last,
  source_id desc
)
include (source_balance, account_id)
where source_missing=false and source_balance is not null;

create or replace function financial_app.home_pulse_core(
  p_month date default date_trunc('month',now())::date
) returns jsonb
language plpgsql
stable security definer
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
  ) into v_sync
  from financial_app.sync_runs
  where source_file_id is not null
  order by started_at desc
  limit 1;

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
    'rules',jsonb_build_object(
      'readOnly',true,
      'singleTransactionPass',true,
      'accountsExcludedFromCriticalPath',true
    )
  );
end;
$$;

create or replace function public.financial_app_home_pulse(
  p_month date default date_trunc('month',now())::date
) returns jsonb
language sql
stable
set search_path='pg_catalog','public','financial_app'
as $$
  select financial_app.home_pulse_core(p_month)
$$;

revoke all on function public.financial_app_home_pulse(date) from public,anon;
grant execute on function public.financial_app_home_pulse(date) to authenticated,service_role;

commit;
