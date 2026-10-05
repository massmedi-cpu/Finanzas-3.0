begin;

-- Financial App 10.0.73 · Axioma §52
-- Motor de presupuestos: histórico ponderado, estacionalidad, tendencia,
-- recurrentes conocidos, extraordinarios y exclusiones canónicas.
-- La fuente bancaria permanece estrictamente en solo lectura.

create or replace function financial_app.budget_month_recommendation(
  p_month text,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_history_start date;
  v_history_end date;
  v_kind text;
  v_available_month_count integer := 0;
  v_trailing3 bigint := 0;
  v_recent_weighted bigint := 0;
  v_seasonal bigint := 0;
  v_seasonal_count integer := 0;
  v_trend_adjustment bigint := 0;
  v_known_recurring bigint := 0;
  v_extraordinary_count integer := 0;
  v_extraordinary_cap bigint := null;
  v_model_amount bigint := 0;
  v_amount bigint := 0;
  v_history jsonb := '[]'::jsonb;
  v_mode text := 'fallback_3_month_average';
  v_explanation text;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_history_start := (v_start - interval '36 months')::date;
  v_history_end := (v_start - interval '1 day')::date;

  if p_category_id is not null then
    select c.kind into v_kind
    from financial_app.categories c
    where c.id = p_category_id;

    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind <> 'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  with facts as (
    select f.bank_date, f.amount_cents
    from financial_app.financial_transaction_facts(v_history_start, v_history_end, null) f
    where f.analytics_eligible
      and f.effective_kind = 'expense'
      and (
        p_category_id is null
        or f.effective_category_id in (
          select s.category_id
          from financial_app.budget_category_scope(p_category_id) s
        )
      )
  ), bounds as (
    select date_trunc('month', min(bank_date))::date as first_month
    from facts
  ), months as (
    select g::date as month_start
    from bounds b
    cross join lateral generate_series(
      greatest(coalesce(b.first_month, (v_start - interval '3 months')::date), v_history_start),
      (v_start - interval '1 month')::date,
      interval '1 month'
    ) g
  ), monthly_raw as (
    select
      m.month_start,
      coalesce(-sum(f.amount_cents), 0)::bigint as expense_cents
    from months m
    left join facts f
      on f.bank_date >= m.month_start
     and f.bank_date < (m.month_start + interval '1 month')::date
    group by m.month_start
  ), robust_stats as (
    select
      count(*) filter (where expense_cents > 0)::integer as positive_months,
      percentile_cont(0.25) within group (order by expense_cents) filter (where expense_cents > 0) as q1,
      percentile_cont(0.75) within group (order by expense_cents) filter (where expense_cents > 0) as q3
    from monthly_raw
  ), normalized as (
    select
      r.month_start,
      r.expense_cents,
      case
        when s.positive_months >= 6
         and s.q1 is not null
         and s.q3 is not null
        then greatest(
          0::numeric,
          s.q3 + (1.5 * (s.q3 - s.q1))
        )
        else null
      end as extraordinary_cap_numeric
    from monthly_raw r
    cross join robust_stats s
  ), adjusted as (
    select
      month_start,
      expense_cents,
      case
        when extraordinary_cap_numeric is not null
          then least(expense_cents::numeric, extraordinary_cap_numeric)::bigint
        else expense_cents
      end as adjusted_expense_cents,
      extraordinary_cap_numeric,
      extraordinary_cap_numeric is not null
        and expense_cents::numeric > extraordinary_cap_numeric as extraordinary
    from normalized
  ), aggregates as (
    select
      count(*)::integer as available_month_count,
      coalesce(round(avg(expense_cents::numeric) filter (
        where month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as trailing3,
      coalesce(round(
        sum(
          adjusted_expense_cents::numeric *
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from month_start)::integer
          ))
        ) filter (where month_start >= (v_start - interval '6 months')::date)
        /
        nullif(sum(
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from month_start)::integer
          ))
        ) filter (where month_start >= (v_start - interval '6 months')::date), 0)
      ), 0)::bigint as recent_weighted,
      coalesce(round(avg(adjusted_expense_cents::numeric) filter (
        where month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as recent3,
      coalesce(round(avg(adjusted_expense_cents::numeric) filter (
        where month_start >= (v_start - interval '6 months')::date
          and month_start < (v_start - interval '3 months')::date
      )), 0)::bigint as previous3,
      count(*) filter (where extraordinary)::integer as extraordinary_count,
      max(extraordinary_cap_numeric)::bigint as extraordinary_cap
    from adjusted
  ), seasonal as (
    select
      coalesce(round(
        sum(
          adjusted_expense_cents::numeric * greatest(
            1,
            4 - (extract(year from v_start)::integer - extract(year from month_start)::integer)
          )
        ) /
        nullif(sum(greatest(
          1,
          4 - (extract(year from v_start)::integer - extract(year from month_start)::integer)
        )), 0)
      ), 0)::bigint as seasonal_amount,
      count(*)::integer as seasonal_count
    from adjusted
    where extract(month from month_start) = extract(month from v_start)
      and month_start <= (v_start - interval '12 months')::date
      and month_start >= (v_start - interval '36 months')::date
  ), last_three as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(month_start, 'YYYY-MM'),
          'expenseCents', expense_cents
        ) order by month_start
      ),
      '[]'::jsonb
    ) as history
    from adjusted
    where month_start >= (v_start - interval '3 months')::date
  )
  select
    a.available_month_count,
    a.trailing3,
    a.recent_weighted,
    s.seasonal_amount,
    s.seasonal_count,
    case
      when a.available_month_count >= 6
       and a.previous3 > 0
       and a.recent_weighted > 0
      then greatest(
        -round(a.recent_weighted::numeric * 0.20)::bigint,
        least(
          round(a.recent_weighted::numeric * 0.20)::bigint,
          round((a.recent3 - a.previous3)::numeric * 0.35)::bigint
        )
      )
      else 0::bigint
    end,
    a.extraordinary_count,
    a.extraordinary_cap,
    l.history
  into
    v_available_month_count,
    v_trailing3,
    v_recent_weighted,
    v_seasonal,
    v_seasonal_count,
    v_trend_adjustment,
    v_extraordinary_count,
    v_extraordinary_cap,
    v_history
  from aggregates a
  cross join seasonal s
  cross join last_three l;

  -- Recurrentes conocidos se usan como suelo, no como suma, para no contar dos veces
  -- obligaciones que normalmente ya están presentes en el histórico.
  with recurring_occurrences as (
    select
      r.id,
      r.category_id,
      r.usual_amount_cents,
      case
        when r.interval_unit = 'week'
          then r.next_estimated_date + ((7 * r.interval_count * g.n)::integer)
        when r.interval_unit = 'month'
          then (r.next_estimated_date + make_interval(months => r.interval_count * g.n))::date
        when r.interval_unit = 'quarter'
          then (r.next_estimated_date + make_interval(months => 3 * r.interval_count * g.n))::date
        when r.interval_unit = 'year'
          then (r.next_estimated_date + make_interval(years => r.interval_count * g.n))::date
        else null::date
      end as occurrence_date
    from financial_app.recurrences r
    cross join generate_series(0, 180) as g(n)
    where r.status = 'active'
      and r.next_estimated_date is not null
      and r.usual_amount_cents < 0
      and r.interval_count > 0
      and r.interval_unit in ('week','month','quarter','year')
      and r.next_estimated_date <= v_end
      and (
        p_category_id is null
        or r.category_id in (
          select s.category_id
          from financial_app.budget_category_scope(p_category_id) s
        )
      )
  )
  select coalesce(sum(-usual_amount_cents), 0)::bigint
  into v_known_recurring
  from recurring_occurrences
  where occurrence_date between v_start and v_end;

  if v_available_month_count < 6 then
    v_mode := 'fallback_3_month_average';
    v_model_amount := coalesce(v_trailing3, 0);
  else
    v_mode := 'axioma_52_weighted';
    v_model_amount := case
      when v_seasonal_count > 0 and v_recent_weighted > 0 then
        round((v_recent_weighted::numeric * 0.75) + (v_seasonal::numeric * 0.25))::bigint
      when v_seasonal_count > 0 then v_seasonal
      else v_recent_weighted
    end;
    v_model_amount := greatest(0, v_model_amount + v_trend_adjustment);
  end if;

  v_amount := greatest(coalesce(v_model_amount, 0), coalesce(v_known_recurring, 0));

  if v_mode = 'fallback_3_month_average' then
    v_explanation := 'Referencia automática basada en la media del gasto elegible de los 3 meses completos anteriores mientras todavía no existe profundidad histórica suficiente. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.';
  else
    v_explanation := 'Referencia automática Axioma §52: pondera más los meses recientes, incorpora el mismo mes de otros años cuando existe, aplica una tendencia limitada, reduce el peso de meses extraordinarios y respeta como suelo los recurrentes activos conocidos. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.';
  end if;

  return jsonb_build_object(
    'automaticAmountCents', coalesce(v_amount, 0),
    'historyMonths', coalesce(v_history, '[]'::jsonb),
    'historyMonthCount', jsonb_array_length(coalesce(v_history, '[]'::jsonb)),
    'historyDateFrom', greatest(v_history_start, (v_start - interval '3 months')::date),
    'historyDateTo', v_history_end,
    'explanation', v_explanation,
    'factors', jsonb_build_object(
      'algorithm', 'axioma_52_budget_reference_v1',
      'mode', v_mode,
      'availableMonthCount', coalesce(v_available_month_count, 0),
      'trailing3AverageCents', coalesce(v_trailing3, 0),
      'recentWeightedCents', coalesce(v_recent_weighted, 0),
      'seasonalSameMonthCents', coalesce(v_seasonal, 0),
      'seasonalMonthCount', coalesce(v_seasonal_count, 0),
      'trendAdjustmentCents', coalesce(v_trend_adjustment, 0),
      'knownRecurringCents', coalesce(v_known_recurring, 0),
      'extraordinaryMonthCount', coalesce(v_extraordinary_count, 0),
      'extraordinaryCapCents', v_extraordinary_cap,
      'recurrencePolicy', 'floor_not_additive',
      'exclusionsSource', 'financial_transaction_facts.analytics_eligible'
    )
  );
end;
$$;

create or replace function financial_app.budget_month_snapshot(p_month text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_total jsonb;
  v_categories jsonb;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;

  with candidates as (
    select null::uuid as category_id
    union
    select c.id
    from financial_app.categories c
    where c.kind = 'expense' and c.lifecycle = 'active'
    union
    select b.category_id
    from financial_app.budgets b
    where b.month = p_month and b.category_id is not null
  ), prepared as (
    select
      x.category_id,
      b.id as budget_id,
      b.manual_amount_cents,
      c.name as category_name,
      c.lifecycle as category_lifecycle,
      coalesce(c.sort_order, -1) as sort_order,
      r.recommendation,
      financial_app.budget_month_actual(p_month, x.category_id) as actual_expense_cents
    from candidates x
    left join financial_app.budgets b
      on b.month = p_month
     and b.category_id is not distinct from x.category_id
    left join financial_app.categories c on c.id = x.category_id
    cross join lateral (
      select financial_app.budget_month_recommendation(p_month, x.category_id) as recommendation
    ) r
  ), projected as (
    select
      p.category_id,
      p.sort_order,
      p.category_name,
      jsonb_build_object(
        'id', p.budget_id,
        'persisted', p.budget_id is not null,
        'categoryId', p.category_id,
        'categoryName', p.category_name,
        'categoryLifecycle', p.category_lifecycle,
        'automaticAmountCents', (p.recommendation->>'automaticAmountCents')::bigint,
        'manualAmountCents', p.manual_amount_cents,
        'effectiveAmountCents', coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint),
        'actualExpenseCents', p.actual_expense_cents,
        'remainingCents', coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) - p.actual_expense_cents,
        'progressBps', case
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) > 0
            then round(
              p.actual_expense_cents::numeric * 10000
              / coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint)
            )::integer
          else null
        end,
        'status', case
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) = 0
               and p.actual_expense_cents = 0 then 'empty'
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) = 0
               and p.actual_expense_cents > 0 then 'unfunded'
          when p.actual_expense_cents > coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) then 'over'
          else 'on_track'
        end,
        'automaticExplanation', p.recommendation->>'explanation',
        'automaticFactors', p.recommendation->'factors',
        'historyMonths', p.recommendation->'historyMonths'
      ) as item
    from prepared p
  )
  select
    (select item from projected where category_id is null),
    coalesce(
      (select jsonb_agg(item order by sort_order, category_name, category_id)
       from projected where category_id is not null),
      '[]'::jsonb
    )
  into v_total, v_categories;

  return jsonb_build_object(
    'contractVersion', 1,
    'month', p_month,
    'monthStart', v_start,
    'monthEnd', v_end,
    'total', v_total,
    'categories', coalesce(v_categories, '[]'::jsonb),
    'principles', jsonb_build_object(
      'bankSource', 'read_only',
      'actualSource', 'financial_transaction_facts',
      'recommendation', 'axioma_52_weighted_history_seasonality_trend_recurrence_floor',
      'transfersConsumeBudget', false,
      'confirmedDuplicatesConsumeBudget', false,
      'manualAnalyticsExclusionsRespected', true,
      'refundsNetAgainstExpense', false,
      'manualOverrideWins', true,
      'parentCategoryIncludesDescendants', true
    )
  );
end;
$$;

revoke all on function financial_app.budget_month_recommendation(text,uuid) from public, anon, authenticated;
revoke all on function financial_app.budget_month_snapshot(text) from public, anon, authenticated;
grant execute on function financial_app.budget_month_recommendation(text,uuid) to financial_app_gateway;
grant execute on function financial_app.budget_month_snapshot(text) to financial_app_gateway;

commit;
