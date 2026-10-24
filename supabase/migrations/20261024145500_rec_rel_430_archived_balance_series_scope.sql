begin;

-- REC-REL-430 · 24/10/2026. Fix archived account selected explicitly.
-- All-account timeline uses ACTIVE aggregate; one-account timeline uses
-- SELECTED TOTAL, including archived accounts. No writes to bank data.
-- Forward-only migration: preserve existing grants and no source changes.

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
        'balanceCents', case
          when p_account_id is null then coalesce((snapshot->>'activeBalanceCents')::bigint, 0)
          else coalesce((snapshot->>'totalBalanceCents')::bigint, 0)
        end,
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
'REC-REL-430: balance mensual de cuenta elegida (incluida archivada) usa totalBalanceCents; agregado general solo activas.';

commit;
