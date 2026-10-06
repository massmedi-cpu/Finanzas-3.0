-- Financial App 10.0.89 · QA-USUARIO-20261006 · QA-08
-- Serie histórica de saldo agregada desde el motor canónico de cuentas.
-- No reconstruye saldos desde cash flow y no modifica la fuente bancaria.

create or replace function financial_app.financial_balance_series(
  p_date_from date,
  p_date_to date,
  p_account_id uuid default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_rows jsonb;
begin
  v_from := coalesce(p_date_from, p_date_to, current_date);
  v_to := coalesce(p_date_to, p_date_from, current_date);

  if v_from > v_to then
    raise exception 'invalid_financial_balance_series_range';
  end if;

  if p_account_id is not null and not exists (
    select 1 from financial_app.accounts a where a.id = p_account_id
  ) then
    raise exception 'financial_account_not_found';
  end if;

  with months as (
    select
      m::date as month_start,
      least((m + interval '1 month - 1 day')::date, v_to) as as_of_date
    from generate_series(
      date_trunc('month', v_from)::date,
      date_trunc('month', v_to)::date,
      interval '1 month'
    ) m
  ), snapshots as (
    select
      month_start,
      as_of_date,
      financial_app.financial_account_balances(as_of_date, false, p_account_id) as snapshot
    from months
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'monthStart', month_start,
        'asOfDate', as_of_date,
        'balanceCents', coalesce((snapshot->>'activeBalanceCents')::bigint, 0),
        'accounts', coalesce((snapshot->'quality'->>'accounts')::int, 0),
        'explicitBalanceAccounts', coalesce((snapshot->'quality'->>'explicitBalanceAccounts')::int, 0),
        'reconstructedBalanceAccounts', coalesce((snapshot->'quality'->>'reconstructedBalanceAccounts')::int, 0)
      )
      order by month_start
    ),
    '[]'::jsonb
  )
  into v_rows
  from snapshots;

  return jsonb_build_object(
    'dateFrom', v_from,
    'dateTo', v_to,
    'accountId', p_account_id,
    'rows', v_rows,
    'principles', jsonb_build_object(
      'bankSource', 'read_only',
      'balanceSource', 'financial_account_balances',
      'cashFlowReconstruction', false,
      'getHasSideEffects', false
    )
  );
end;
$$;

revoke all on function financial_app.financial_balance_series(date,date,uuid) from public,anon,authenticated;
revoke all on function financial_app.financial_balance_series(date,date,uuid) from service_role;
grant execute on function financial_app.financial_balance_series(date,date,uuid) to financial_app_gateway;

comment on function financial_app.financial_balance_series(date,date,uuid) is
'QA-08 10.0.89: evolución mensual de saldo usando exclusivamente financial_account_balances; fuente bancaria solo lectura.';
