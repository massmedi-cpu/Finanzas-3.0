begin;

-- QA Work 2026-10-07 · Presupuestos
-- Evita el patrón N× del snapshot mensual: los hechos financieros con reparto se
-- materializan una sola vez para el total y todas las categorías.
-- No cambia la semántica Axioma §52 ni escribe en la fuente bancaria.

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
  v_history_start date;
  v_history_end date;
  v_total jsonb;
  v_categories jsonb;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_history_start := (v_start - interval '36 months')::date;
  v_history_end := (v_start - interval '1 day')::date;

  if exists (
    select 1
    from financial_app.budgets b
    join financial_app.categories c on c.id = b.category_id
    where b.month = p_month
      and b.category_id is not null
      and c.kind <> 'expense'
  ) then
    raise exception 'budget_category_must_be_expense';
  end if;

  with recursive
  candidates as (
    select null::uuid as category_id
    union
    select c.id
    from financial_app.categories c
    where c.kind = 'expense' and c.lifecycle = 'active'
    union
    select b.category_id
    from financial_app.budgets b
    where b.month = p_month and b.category_id is not null
  ),
  category_scope(root_category_id, category_id) as (
    select c.id, c.id
    from financial_app.categories c
    where c.kind = 'expense'

    union all

    select s.root_category_id, child.id
    from category_scope s
    join financial_app.categories child on child.parent_category_id = s.category_id
    where child.kind = 'expense'
  ),
  all_facts as materialized (
    select
      f.bank_date,
      f.effective_category_id,
      f.amount_cents
    from financial_app.financial_transaction_allocation_facts(
      v_history_start,
      v_end,
      null
    ) f
    where f.analytics_eligible
      and f.effective_kind = 'expense'
  ),
  scoped_facts as materialized (
    select
      null::uuid as category_id,
      f.bank_date,
      f.amount_cents
    from all_facts f

    union all

    select
      s.root_category_id as category_id,
      f.bank_date,
      f.amount_cents
    from all_facts f
    join category_scope s on s.category_id = f.effective_category_id
  ),
  scoped_monthly as materialized (
    select
      f.category_id,
      date_trunc('month', f.bank_date)::date as month_start,
      coalesce(-sum(f.amount_cents), 0)::bigint as expense_cents
    from scoped_facts f
    where f.bank_date <= v_history_end
    group by f.category_id, date_trunc('month', f.bank_date)::date
  ),
  bounds as (
    select
      c.category_id,
      min(m.month_start) as first_month
    from candidates c
    left join scoped_monthly m
      on m.category_id is not distinct from c.category_id
    group by c.category_id
  ),
  months as (
    select
      b.category_id,
      g::date as month_start
    from bounds b
    cross join lateral generate_series(
      greatest(
        coalesce(b.first_month, (v_start - interval '3 months')::date),
        v_history_start
      ),
      (v_start - interval '1 month')::date,
      interval '1 month'
    ) g
  ),
  monthly_raw as materialized (
    select
      m.category_id,
      m.month_start,
      coalesce(s.expense_cents, 0)::bigint as expense_cents
    from months m
    left join scoped_monthly s
      on s.category_id is not distinct from m.category_id
     and s.month_start = m.month_start
  ),
  robust_stats as (
    select
      r.category_id,
      count(*) filter (where r.expense_cents > 0)::integer as positive_months,
      percentile_cont(0.25) within group (order by r.expense_cents)
        filter (where r.expense_cents > 0) as q1,
      percentile_cont(0.75) within group (order by r.expense_cents)
        filter (where r.expense_cents > 0) as q3
    from monthly_raw r
    group by r.category_id
  ),
  adjusted as materialized (
    select
      r.category_id,
      r.month_start,
      r.expense_cents,
      case
        when s.positive_months >= 6
         and s.q1 is not null
         and s.q3 is not null
          then least(
            r.expense_cents::numeric,
            greatest(0::numeric, s.q3 + (1.5 * (s.q3 - s.q1)))
          )::bigint
        else r.expense_cents
      end as adjusted_expense_cents,
      case
        when s.positive_months >= 6
         and s.q1 is not null
         and s.q3 is not null
          then greatest(0::numeric, s.q3 + (1.5 * (s.q3 - s.q1)))
        else null::numeric
      end as extraordinary_cap_numeric
    from monthly_raw r
    join robust_stats s
      on s.category_id is not distinct from r.category_id
  ),
  aggregates as (
    select
      a.category_id,
      count(*)::integer as available_month_count,
      coalesce(round(avg(a.expense_cents::numeric) filter (
        where a.month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as trailing3,
      coalesce(round(
        sum(
          a.adjusted_expense_cents::numeric *
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from a.month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from a.month_start)::integer
          ))
        ) filter (
          where a.month_start >= (v_start - interval '6 months')::date
        )
        /
        nullif(sum(
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from a.month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from a.month_start)::integer
          ))
        ) filter (
          where a.month_start >= (v_start - interval '6 months')::date
        ), 0)
      ), 0)::bigint as recent_weighted,
      coalesce(round(avg(a.adjusted_expense_cents::numeric) filter (
        where a.month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as recent3,
      coalesce(round(avg(a.adjusted_expense_cents::numeric) filter (
        where a.month_start >= (v_start - interval '6 months')::date
          and a.month_start < (v_start - interval '3 months')::date
      )), 0)::bigint as previous3,
      count(*) filter (
        where a.extraordinary_cap_numeric is not null
          and a.expense_cents::numeric > a.extraordinary_cap_numeric
      )::integer as extraordinary_count,
      max(a.extraordinary_cap_numeric)::bigint as extraordinary_cap
    from adjusted a
    group by a.category_id
  ),
  seasonal as (
    select
      a.category_id,
      coalesce(round(
        sum(
          a.adjusted_expense_cents::numeric *
          greatest(
            1,
            4 - (extract(year from v_start)::integer - extract(year from a.month_start)::integer)
          )
        )
        /
        nullif(sum(greatest(
          1,
          4 - (extract(year from v_start)::integer - extract(year from a.month_start)::integer)
        )), 0)
      ), 0)::bigint as seasonal_amount,
      count(*)::integer as seasonal_count
    from adjusted a
    where extract(month from a.month_start) = extract(month from v_start)
      and a.month_start <= (v_start - interval '12 months')::date
      and a.month_start >= (v_start - interval '36 months')::date
    group by a.category_id
  ),
  last_three as (
    select
      a.category_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'month', to_char(a.month_start, 'YYYY-MM'),
            'expenseCents', a.expense_cents
          )
          order by a.month_start
        ),
        '[]'::jsonb
      ) as history
    from adjusted a
    where a.month_start >= (v_start - interval '3 months')::date
    group by a.category_id
  ),
  recurring_base as materialized (
    select
      r.id,
      r.category_id as source_category_id,
      r.usual_amount_cents,
      r.next_estimated_date,
      r.interval_unit,
      r.interval_count
    from financial_app.recurrences r
    where r.status = 'active'
      and r.next_estimated_date is not null
      and r.usual_amount_cents < 0
      and r.interval_count > 0
      and r.interval_unit in ('week', 'month', 'quarter', 'year')
      and r.next_estimated_date <= v_end
  ),
  recurring_scoped as (
    select
      null::uuid as category_id,
      r.id,
      r.usual_amount_cents,
      r.next_estimated_date,
      r.interval_unit,
      r.interval_count
    from recurring_base r

    union all

    select
      s.root_category_id as category_id,
      r.id,
      r.usual_amount_cents,
      r.next_estimated_date,
      r.interval_unit,
      r.interval_count
    from recurring_base r
    join category_scope s on s.category_id = r.source_category_id
  ),
  recurring_occurrences as (
    select
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
    from recurring_scoped r
    cross join generate_series(0, 180) as g(n)
  ),
  recurring_totals as (
    select
      r.category_id,
      coalesce(sum(-r.usual_amount_cents), 0)::bigint as known_recurring
    from recurring_occurrences r
    where r.occurrence_date between v_start and v_end
    group by r.category_id
  ),
  actuals as (
    select
      f.category_id,
      coalesce(-sum(f.amount_cents), 0)::bigint as actual_expense_cents
    from scoped_facts f
    where f.bank_date between v_start and v_end
    group by f.category_id
  ),
  computed as (
    select
      c.category_id,
      a.available_month_count,
      a.trailing3,
      a.recent_weighted,
      coalesce(s.seasonal_amount, 0)::bigint as seasonal_amount,
      coalesce(s.seasonal_count, 0)::integer as seasonal_count,
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
      end as trend_adjustment,
      coalesce(r.known_recurring, 0)::bigint as known_recurring,
      a.extraordinary_count,
      a.extraordinary_cap,
      coalesce(l.history, '[]'::jsonb) as history,
      coalesce(x.actual_expense_cents, 0)::bigint as actual_expense_cents
    from candidates c
    join aggregates a
      on a.category_id is not distinct from c.category_id
    left join seasonal s
      on s.category_id is not distinct from c.category_id
    left join recurring_totals r
      on r.category_id is not distinct from c.category_id
    left join last_three l
      on l.category_id is not distinct from c.category_id
    left join actuals x
      on x.category_id is not distinct from c.category_id
  ),
  modeled as (
    select
      c.*,
      case
        when c.available_month_count < 6 then 'fallback_3_month_average'
        else 'axioma_52_weighted'
      end as mode,
      case
        when c.available_month_count < 6
          then coalesce(c.trailing3, 0)
        else greatest(
          0,
          case
            when c.seasonal_count > 0 and c.recent_weighted > 0
              then round(
                (c.recent_weighted::numeric * 0.75)
                + (c.seasonal_amount::numeric * 0.25)
              )::bigint
            when c.seasonal_count > 0 then c.seasonal_amount
            else c.recent_weighted
          end + c.trend_adjustment
        )
      end as model_amount
    from computed c
  ),
  recommendations as (
    select
      m.category_id,
      jsonb_build_object(
        'automaticAmountCents',
          greatest(coalesce(m.model_amount, 0), coalesce(m.known_recurring, 0)),
        'historyMonths', m.history,
        'historyMonthCount', jsonb_array_length(m.history),
        'historyDateFrom',
          greatest(v_history_start, (v_start - interval '3 months')::date),
        'historyDateTo', v_history_end,
        'explanation',
          case
            when m.mode = 'fallback_3_month_average'
              then 'Referencia automática basada en la media del gasto elegible de los 3 meses completos anteriores mientras todavía no existe profundidad histórica suficiente. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.'
            else 'Referencia automática Axioma §52: pondera más los meses recientes, incorpora el mismo mes de otros años cuando existe, aplica una tendencia limitada, reduce el peso de meses extraordinarios y respeta como suelo los recurrentes activos conocidos. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.'
          end,
        'factors', jsonb_build_object(
          'algorithm', 'axioma_52_budget_reference_v1',
          'mode', m.mode,
          'availableMonthCount', coalesce(m.available_month_count, 0),
          'trailing3AverageCents', coalesce(m.trailing3, 0),
          'recentWeightedCents', coalesce(m.recent_weighted, 0),
          'seasonalSameMonthCents', coalesce(m.seasonal_amount, 0),
          'seasonalMonthCount', coalesce(m.seasonal_count, 0),
          'trendAdjustmentCents', coalesce(m.trend_adjustment, 0),
          'knownRecurringCents', coalesce(m.known_recurring, 0),
          'extraordinaryMonthCount', coalesce(m.extraordinary_count, 0),
          'extraordinaryCapCents', m.extraordinary_cap,
          'recurrencePolicy', 'floor_not_additive',
          'exclusionsSource',
            'financial_transaction_allocation_facts.analytics_eligible'
        )
      ) as recommendation,
      m.actual_expense_cents
    from modeled m
  ),
  prepared as (
    select
      c.category_id,
      b.id as budget_id,
      b.manual_amount_cents,
      x.name as category_name,
      x.lifecycle as category_lifecycle,
      coalesce(x.sort_order, -1) as sort_order,
      r.recommendation,
      r.actual_expense_cents
    from candidates c
    left join financial_app.budgets b
      on b.month = p_month
     and b.category_id is not distinct from c.category_id
    left join financial_app.categories x on x.id = c.category_id
    join recommendations r
      on r.category_id is not distinct from c.category_id
  ),
  projected as (
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
        'automaticAmountCents',
          (p.recommendation->>'automaticAmountCents')::bigint,
        'manualAmountCents', p.manual_amount_cents,
        'effectiveAmountCents',
          coalesce(
            p.manual_amount_cents,
            (p.recommendation->>'automaticAmountCents')::bigint
          ),
        'actualExpenseCents', p.actual_expense_cents,
        'remainingCents',
          coalesce(
            p.manual_amount_cents,
            (p.recommendation->>'automaticAmountCents')::bigint
          ) - p.actual_expense_cents,
        'progressBps',
          case
            when coalesce(
              p.manual_amount_cents,
              (p.recommendation->>'automaticAmountCents')::bigint
            ) > 0
              then round(
                p.actual_expense_cents::numeric * 10000
                /
                coalesce(
                  p.manual_amount_cents,
                  (p.recommendation->>'automaticAmountCents')::bigint
                )
              )::integer
            else null
          end,
        'status',
          case
            when coalesce(
              p.manual_amount_cents,
              (p.recommendation->>'automaticAmountCents')::bigint
            ) = 0
             and p.actual_expense_cents = 0
              then 'empty'
            when coalesce(
              p.manual_amount_cents,
              (p.recommendation->>'automaticAmountCents')::bigint
            ) = 0
             and p.actual_expense_cents > 0
              then 'unfunded'
            when p.actual_expense_cents > coalesce(
              p.manual_amount_cents,
              (p.recommendation->>'automaticAmountCents')::bigint
            )
              then 'over'
            else 'on_track'
          end,
        'automaticExplanation', p.recommendation->>'explanation',
        'automaticFactors', p.recommendation->'factors',
        'historyMonths', p.recommendation->'historyMonths'
      ) as item
    from prepared p
  )
  select
    (select p.item from projected p where p.category_id is null),
    coalesce(
      (
        select jsonb_agg(
          p.item
          order by p.sort_order, p.category_name, p.category_id
        )
        from projected p
        where p.category_id is not null
      ),
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
      'actualSource', 'financial_transaction_allocation_facts',
      'recommendation',
        'axioma_52_weighted_history_seasonality_trend_recurrence_floor',
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

revoke all on function financial_app.budget_month_snapshot(text)
  from public, anon, authenticated;
revoke all on function financial_app.budget_month_snapshot(text)
  from service_role;
grant execute on function financial_app.budget_month_snapshot(text)
  to financial_app_gateway;

comment on function financial_app.budget_month_snapshot(text) is
'QA Work 2026-10-07: snapshot presupuestario Axioma §52 agregado en un único recorrido de hechos con reparto; elimina el patrón N× sin cambiar el contrato.';

commit;
