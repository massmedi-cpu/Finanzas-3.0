-- Financial App 10.0.87 · QA-USUARIO-20261006 · QA-01
-- Evita que Previsión reconstruya el detalle completo de todas las categorías
-- por cada mes del horizonte. Conserva exactamente la semántica del total
-- presupuestario y mantiene la fuente bancaria en solo lectura.

create or replace function financial_app.budget_month_total_context(p_month text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_rec jsonb;
  v_budget_id uuid;
  v_manual bigint;
  v_automatic bigint;
  v_effective bigint;
  v_actual bigint;
  v_remaining bigint;
  v_status text;
begin
  perform financial_app.budget_month_start(p_month);

  v_rec := financial_app.budget_month_recommendation(p_month, null);
  v_automatic := coalesce((v_rec->>'automaticAmountCents')::bigint, 0);

  select b.id,b.manual_amount_cents
    into v_budget_id,v_manual
  from financial_app.budgets b
  where b.month=p_month and b.category_id is null;

  v_actual := financial_app.budget_month_actual(p_month, null);
  v_effective := coalesce(v_manual,v_automatic);
  v_remaining := v_effective-v_actual;
  v_status := case
    when v_effective=0 and v_actual=0 then 'empty'
    when v_effective=0 and v_actual>0 then 'unfunded'
    when v_actual>v_effective then 'over'
    else 'on_track'
  end;

  return jsonb_build_object(
    'month',p_month,
    'budgetCents',v_effective,
    'actualExpenseCents',v_actual,
    'remainingCents',v_remaining,
    'status',v_status,
    'automaticAmountCents',v_automatic,
    'manualAmountCents',v_manual,
    'persisted',v_budget_id is not null
  );
end;
$$;

revoke all on function financial_app.budget_month_total_context(text) from public,anon,authenticated;
revoke all on function financial_app.budget_month_total_context(text) from service_role;
grant execute on function financial_app.budget_month_total_context(text) to financial_app_gateway;

create or replace function financial_app.forecast_snapshot(
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
  v_balances jsonb;
  v_opening bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_budgets jsonb := '[]'::jsonb;
  v_income bigint := 0;
  v_expense bigint := 0;
  v_net bigint := 0;
  v_planned integer := 0;
  v_excluded integer := 0;
  v_confirmed integer := 0;
begin
  perform financial_app.validate_forecast_range(p_date_from,p_date_to);

  if p_account_id is not null and not exists (
    select 1 from financial_app.accounts where id=p_account_id
  ) then
    raise exception 'forecast_account_not_found';
  end if;

  select financial_app.financial_account_balances(p_date_from, false, p_account_id)
  into v_balances;
  v_opening := coalesce((v_balances->>'totalBalanceCents')::bigint,0);

  with base as (
    select
      fi.*,
      a.name as account_name,
      c.name as category_name,
      m.name as merchant_name,
      f.bank_date as actual_date,
      f.amount_cents as actual_amount_cents,
      f.account_id as actual_account_id,
      f.effective_category_id as actual_category_id,
      f.effective_merchant_id as actual_merchant_id,
      f.analytics_eligible as actual_analytics_eligible,
      case
        when fi.confirmed_transaction_id is not null then 0::bigint
        when fi.excluded then 0::bigint
        else fi.amount_cents
      end as projection_effect_cents
    from financial_app.forecast_items fi
    left join financial_app.accounts a on a.id=fi.account_id
    left join financial_app.categories c on c.id=fi.category_id
    left join financial_app.merchants m on m.id=fi.merchant_id
    left join financial_app.financial_transaction_facts() f
      on f.transaction_id=fi.confirmed_transaction_id
    where fi.date between p_date_from and p_date_to
      and (p_account_id is null or fi.account_id=p_account_id)
  ), running as (
    select *,
      v_opening + sum(projection_effect_cents) over(order by date,id rows unbounded preceding)
        as projected_balance_after_cents
    from base
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id',id,
      'date',date,
      'accountId',account_id,
      'accountName',account_name,
      'categoryId',category_id,
      'categoryName',category_name,
      'merchantId',merchant_id,
      'merchantName',merchant_name,
      'concept',concept,
      'amountCents',amount_cents,
      'origin',origin,
      'confidence',confidence,
      'recurrenceId',recurrence_id,
      'budgetId',budget_id,
      'confirmedTransactionId',confirmed_transaction_id,
      'excluded',excluded,
      'excludedReason',excluded_reason,
      'reconciliationNote',reconciliation_note,
      'projectionKey',projection_key,
      'updatedAt',updated_at,
      'status',case when confirmed_transaction_id is not null then 'confirmed' when excluded then 'excluded' else 'planned' end,
      'affectsProjection',projection_effect_cents <> 0,
      'projectionEffectCents',projection_effect_cents,
      'projectedBalanceAfterCents',projected_balance_after_cents,
      'actual',case when confirmed_transaction_id is null then null else jsonb_build_object(
        'date',actual_date,
        'amountCents',actual_amount_cents,
        'accountId',actual_account_id,
        'categoryId',actual_category_id,
        'merchantId',actual_merchant_id,
        'analyticsEligible',actual_analytics_eligible
      ) end
    ) order by date,id),'[]'::jsonb),
    coalesce(sum(case when projection_effect_cents > 0 then projection_effect_cents else 0 end),0)::bigint,
    coalesce(sum(case when projection_effect_cents < 0 then -projection_effect_cents else 0 end),0)::bigint,
    coalesce(sum(projection_effect_cents),0)::bigint,
    count(*) filter (where confirmed_transaction_id is null and not excluded)::int,
    count(*) filter (where excluded)::int,
    count(*) filter (where confirmed_transaction_id is not null)::int
  into v_items,v_income,v_expense,v_net,v_planned,v_excluded,v_confirmed
  from running;

  with months as (
    select to_char(m::date,'YYYY-MM') as month
    from generate_series(
      date_trunc('month',p_date_from)::date,
      date_trunc('month',p_date_to)::date,
      interval '1 month'
    ) m
  ), contexts as (
    select month, financial_app.budget_month_total_context(month) as context
    from months
  )
  select coalesce(jsonb_agg(context order by month),'[]'::jsonb)
    into v_budgets
  from contexts;

  return jsonb_build_object(
    'contractVersion',1,
    'period',jsonb_build_object('dateFrom',p_date_from,'dateTo',p_date_to,'accountId',p_account_id),
    'summary',jsonb_build_object(
      'openingBalanceCents',v_opening,
      'projectedIncomeCents',v_income,
      'projectedExpenseCents',v_expense,
      'projectedNetCents',v_net,
      'projectedClosingBalanceCents',v_opening + v_net,
      'plannedItems',v_planned,
      'excludedItems',v_excluded,
      'confirmedItems',v_confirmed
    ),
    'items',v_items,
    'budgetContext',v_budgets,
    'balanceContext',v_balances,
    'principles',jsonb_build_object(
      'bankSource','read_only',
      'openingBalanceSource','financial_account_balances_same_day',
      'recurrenceSource','active_recurrences_only',
      'budgetsCreateDatedItems',false,
      'excludedItemsAffectCashFlow',false,
      'confirmedItemsAffectCashFlow',false,
      'getHasSideEffects',false
    )
  );
end;
$$;

revoke all on function financial_app.forecast_snapshot(date,date,uuid) from public,anon,authenticated;
revoke all on function financial_app.forecast_snapshot(date,date,uuid) from service_role;
grant execute on function financial_app.forecast_snapshot(date,date,uuid) to financial_app_gateway;

comment on function financial_app.budget_month_total_context(text) is
'QA-01 10.0.87: contexto total de presupuesto para Previsión sin recalcular todas las categorías.';
comment on function financial_app.forecast_snapshot(date,date,uuid) is
'QA-01 10.0.87: Previsión usa contexto total de presupuesto y evita cascadas por categoría; fuente bancaria solo lectura.';
