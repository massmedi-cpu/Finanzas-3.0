type AnalysisQueryInput = {
  dateFrom: string;
  dateTo: string;
  previousDateFrom: string;
  previousDateTo: string;
  historyDateFrom: string;
  accountId: string | null;
  budgetMonth: string;
};

export function runAnalysisSnapshotQuery(sql: any, input: AnalysisQueryInput) {
  return sql`
    with p as (
      select
        ${input.dateFrom}::date as date_from,
        ${input.dateTo}::date as date_to,
        ${input.previousDateFrom}::date as previous_from,
        ${input.previousDateTo}::date as previous_to,
        ${input.historyDateFrom}::date as history_from,
        ${input.accountId}::uuid as account_id,
        ${input.budgetMonth}::text as budget_month,
        to_date(${input.budgetMonth} || '-01', 'YYYY-MM-DD') as budget_start,
        (to_date(${input.budgetMonth} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date as budget_end,
        (current_timestamp at time zone 'Europe/Madrid')::date as today,
        (date_trunc('month', ${input.dateTo}::date) + interval '1 month - 1 day')::date as forecast_date_to
    ),
    bounds as (
      select p.*,
        least(
          p.history_from,
          p.previous_from,
          (p.budget_start - interval '3 months')::date
        ) as facts_from
      from p
    ),
    facts as materialized (
      select f.*
      from bounds p
      cross join lateral financial_app.financial_transaction_facts(p.facts_from, p.date_to, p.account_id) f
    ),
    expenses as materialized (
      select
        f.*,
        c.name as category_name,
        m.name as merchant_name,
        coalesce(nullif(btrim(o.concept_override), ''), t.concept_normalized) as concept_normalized,
        financial_app.normalize_label(
          coalesce(nullif(btrim(o.concept_override), ''), t.concept_normalized)
        ) as concept_key
      from facts f
      join financial_app.transactions t on t.id = f.transaction_id
      left join financial_app.transaction_overrides o on o.transaction_id = f.transaction_id
      left join financial_app.categories c on c.id = f.effective_category_id
      left join financial_app.merchants m on m.id = f.effective_merchant_id
      where f.analytics_eligible and f.effective_kind = 'expense'
    ),
    current_expenses as materialized (
      select e.*
      from expenses e
      cross join bounds p
      where e.bank_date between p.date_from and p.date_to
    ),
    category_rollup as (
      select
        e.effective_category_id as id,
        coalesce(max(e.category_name), 'Sin categoría') as name,
        coalesce(sum(-e.amount_cents) filter (where e.bank_date between p.date_from and p.date_to), 0)::bigint as current_cents,
        coalesce(sum(-e.amount_cents) filter (where e.bank_date between p.previous_from and p.previous_to), 0)::bigint as previous_cents,
        count(*) filter (where e.bank_date between p.date_from and p.date_to)::int as current_rows,
        count(*) filter (where e.bank_date between p.previous_from and p.previous_to)::int as previous_rows
      from expenses e
      cross join bounds p
      where e.bank_date between p.previous_from and p.date_to
      group by e.effective_category_id
    ),
    merchant_history as (
      select
        e.effective_merchant_id as id,
        count(*)::int as history_rows,
        round(avg((-e.amount_cents)::numeric))::bigint as habitual_cents,
        coalesce(stddev_pop((-e.amount_cents)::numeric), 0) as stddev_cents
      from expenses e
      cross join bounds p
      where e.effective_merchant_id is not null
        and e.bank_date >= least(p.history_from, p.previous_from)
        and e.bank_date < p.date_from
      group by e.effective_merchant_id
    ),
    merchant_rollup as (
      select
        e.effective_merchant_id as id,
        coalesce(max(e.merchant_name), 'Sin comercio') as name,
        coalesce(sum(-e.amount_cents) filter (where e.bank_date between p.date_from and p.date_to), 0)::bigint as current_cents,
        coalesce(sum(-e.amount_cents) filter (where e.bank_date between p.previous_from and p.previous_to), 0)::bigint as previous_cents,
        count(*) filter (where e.bank_date between p.date_from and p.date_to)::int as current_rows,
        count(*) filter (where e.bank_date between p.previous_from and p.previous_to)::int as previous_rows,
        round(avg((-e.amount_cents)::numeric) filter (where e.bank_date between p.date_from and p.date_to))::bigint as current_average_cents
      from expenses e
      cross join bounds p
      where e.bank_date between p.previous_from and p.date_to
      group by e.effective_merchant_id
    ),
    current_total as (
      select coalesce(sum(-e.amount_cents), 0)::bigint as expense_cents
      from current_expenses e
    ),
    daily_spend as (
      select
        e.bank_date,
        sum(-e.amount_cents)::bigint as expense_cents,
        count(*)::int as rows
      from current_expenses e
      group by e.bank_date
      order by e.bank_date
    ),
    weekday_spend as (
      select
        extract(isodow from e.bank_date)::int as weekday,
        sum(-e.amount_cents)::bigint as expense_cents,
        count(*)::int as rows,
        round(avg((-e.amount_cents)::numeric))::bigint as average_cents
      from current_expenses e
      group by extract(isodow from e.bank_date)
      order by weekday
    ),
    amount_bands as (
      select
        case
          when -e.amount_cents < 1000 then 'lt10'
          when -e.amount_cents < 2500 then '10to25'
          when -e.amount_cents < 5000 then '25to50'
          when -e.amount_cents < 10000 then '50to100'
          when -e.amount_cents < 25000 then '100to250'
          else 'gte250'
        end as band,
        case
          when -e.amount_cents < 1000 then 1
          when -e.amount_cents < 2500 then 2
          when -e.amount_cents < 5000 then 3
          when -e.amount_cents < 10000 then 4
          when -e.amount_cents < 25000 then 5
          else 6
        end as band_order,
        sum(-e.amount_cents)::bigint as expense_cents,
        count(*)::int as rows
      from current_expenses e
      group by band, band_order
      order by band_order
    ),
    concept_rollup as (
      select
        coalesce(nullif(btrim(e.concept_normalized), ''), 'Sin concepto') as concept,
        sum(-e.amount_cents)::bigint as expense_cents,
        count(*)::int as rows,
        round(avg((-e.amount_cents)::numeric))::bigint as average_cents
      from current_expenses e
      group by coalesce(nullif(btrim(e.concept_normalized), ''), 'Sin concepto')
      order by expense_cents desc, rows desc, concept
      limit 15
    ),
    account_rollup as (
      select
        e.account_id,
        coalesce(max(a.name), 'Cuenta') as account_name,
        sum(-e.amount_cents)::bigint as expense_cents,
        count(*)::int as rows,
        round(avg((-e.amount_cents)::numeric))::bigint as average_cents
      from current_expenses e
      left join financial_app.accounts a on a.id = e.account_id
      group by e.account_id
      order by expense_cents desc, account_name
    ),
    top_transactions as (
      select
        e.transaction_id,
        e.bank_date,
        -e.amount_cents as amount_cents,
        coalesce(nullif(btrim(e.concept_normalized), ''), 'Sin concepto') as concept_normalized,
        e.effective_merchant_id as merchant_id,
        coalesce(e.merchant_name, 'Sin comercio') as merchant_name,
        e.effective_category_id as category_id,
        coalesce(e.category_name, 'Sin categoría') as category_name,
        e.account_id,
        coalesce(a.name, 'Cuenta') as account_name
      from current_expenses e
      left join financial_app.accounts a on a.id = e.account_id
      order by -e.amount_cents desc, e.bank_date desc, e.transaction_id
      limit 10
    ),
    anomalies as (
      select
        e.transaction_id,
        e.bank_date,
        -e.amount_cents as amount_cents,
        e.effective_merchant_id as merchant_id,
        coalesce(e.merchant_name, 'Sin comercio') as merchant_name,
        e.effective_category_id as category_id,
        coalesce(e.category_name, 'Sin categoría') as category_name,
        e.concept_normalized,
        h.habitual_cents,
        h.history_rows,
        case when h.habitual_cents > 0
          then round(((-e.amount_cents - h.habitual_cents)::numeric * 10000) / h.habitual_cents)::int
          else null
        end as variation_bps
      from current_expenses e
      join merchant_history h on h.id = e.effective_merchant_id
      where h.history_rows >= 4
        and (-e.amount_cents)::numeric > h.habitual_cents + (2 * h.stddev_cents)
      order by (-e.amount_cents - h.habitual_cents) desc, e.bank_date desc, e.transaction_id
      limit 8
    ),
    reliable_recurrences as (
      select r.*
      from financial_app.recurrences r
      cross join bounds p
      where r.status = 'active'
        and r.confidence in ('high', 'medium')
        and r.merchant_id is not null
        and (p.account_id is null or r.account_id is null or r.account_id = p.account_id)
    ),
    fixed_stats as (
      select
        (select count(*)::int from reliable_recurrences) as reliable_recurrences,
        coalesce(sum(-e.amount_cents) filter (
          where exists (
            select 1
            from reliable_recurrences r
            where r.merchant_id = e.effective_merchant_id
              and (r.account_id is null or r.account_id = e.account_id)
              and (r.category_id is null or r.category_id = e.effective_category_id)
              and financial_app.normalize_label(r.concept_pattern) = e.concept_key
              and abs(e.amount_cents - r.usual_amount_cents) <= r.amount_tolerance_cents
          )
        ), 0)::bigint as fixed_expense_cents
      from current_expenses e
    ),
    budget_months as (
      select (p.budget_start - (g.n || ' months')::interval)::date as month_start
      from bounds p
      cross join generate_series(3, 1, -1) as g(n)
    ),
    budget_history as (
      select
        m.month_start,
        coalesce(sum(-e.amount_cents), 0)::bigint as expense_cents
      from budget_months m
      left join expenses e
        on e.bank_date >= m.month_start
       and e.bank_date < (m.month_start + interval '1 month')::date
      group by m.month_start
    ),
    budget_automatic as (
      select coalesce(round(avg(expense_cents::numeric)), 0)::bigint as amount_cents
      from budget_history
    ),
    budget_override as (
      select b.manual_amount_cents
      from financial_app.budgets b
      cross join bounds p
      where b.month = p.budget_month and b.category_id is null
      order by b.updated_at desc, b.id
      limit 1
    ),
    budget_actual as (
      select coalesce(sum(-e.amount_cents), 0)::bigint as amount_cents
      from expenses e
      cross join bounds p
      where e.bank_date between p.budget_start and least(p.budget_end, p.date_to)
    ),
    budget_light as (
      select
        a.amount_cents as automatic_cents,
        o.manual_amount_cents,
        coalesce(o.manual_amount_cents, a.amount_cents) as effective_cents,
        x.amount_cents as actual_cents
      from budget_automatic a
      cross join budget_actual x
      left join budget_override o on true
    ),
    forecast_light as (
      select
        count(*) filter (where fi.confirmed_transaction_id is null and not fi.excluded)::int as planned_items,
        coalesce(sum(case
          when fi.confirmed_transaction_id is null and not fi.excluded and fi.amount_cents > 0 then fi.amount_cents
          else 0
        end), 0)::bigint as income_cents,
        coalesce(sum(case
          when fi.confirmed_transaction_id is null and not fi.excluded and fi.amount_cents < 0 then -fi.amount_cents
          else 0
        end), 0)::bigint as expense_cents,
        coalesce(sum(case
          when fi.confirmed_transaction_id is null and not fi.excluded then fi.amount_cents
          else 0
        end), 0)::bigint as net_cents
      from financial_app.forecast_items fi
      cross join bounds p
      where p.date_to >= p.today
        and fi.date between greatest(p.today, p.date_from) and p.forecast_date_to
        and (p.account_id is null or fi.account_id = p.account_id)
    )
    select jsonb_build_object(
      'current', financial_app.financial_period_summary(p.date_from, p.date_to, p.account_id),
      'previous', financial_app.financial_period_summary(p.previous_from, p.previous_to, p.account_id),
      'history', financial_app.financial_monthly_series(p.history_from, p.date_to, p.account_id),
      'accounts', (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', a.id, 'name', a.name, 'lifecycle', a.lifecycle)
          order by case a.lifecycle when 'active' then 0 else 1 end, a.sort_order, a.name, a.id
        ), '[]'::jsonb)
        from financial_app.accounts a
      ),
      'categories', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'currentExpenseCents', c.current_cents,
          'previousExpenseCents', c.previous_cents,
          'currentRows', c.current_rows,
          'previousRows', c.previous_rows
        ) order by c.current_cents desc, abs(c.current_cents - c.previous_cents) desc, c.name), '[]'::jsonb)
        from category_rollup c
        where c.current_cents > 0 or c.previous_cents > 0
      ),
      'merchants', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id,
          'name', x.name,
          'currentExpenseCents', x.current_cents,
          'previousExpenseCents', x.previous_cents,
          'currentRows', x.current_rows,
          'previousRows', x.previous_rows,
          'currentAverageCents', x.current_average_cents,
          'habitualAverageCents', x.habitual_cents,
          'historyRows', x.history_rows
        ) order by x.current_cents desc, abs(x.current_cents - x.previous_cents) desc, x.name), '[]'::jsonb)
        from (
          select m.*, h.habitual_cents, h.history_rows
          from merchant_rollup m
          left join merchant_history h using (id)
          where m.current_cents > 0 or m.previous_cents > 0
          order by m.current_cents desc, abs(m.current_cents - m.previous_cents) desc, m.name
          limit 30
        ) x
      ),
      'dailySpend', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.bank_date,
          'expenseCents', d.expense_cents,
          'rows', d.rows
        ) order by d.bank_date), '[]'::jsonb)
        from daily_spend d
      ),
      'weekdaySpend', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'weekday', w.weekday,
          'expenseCents', w.expense_cents,
          'rows', w.rows,
          'averageCents', w.average_cents
        ) order by w.weekday), '[]'::jsonb)
        from weekday_spend w
      ),
      'amountBands', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'band', b.band,
          'expenseCents', b.expense_cents,
          'rows', b.rows
        ) order by b.band_order), '[]'::jsonb)
        from amount_bands b
      ),
      'concepts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'concept', c.concept,
          'expenseCents', c.expense_cents,
          'rows', c.rows,
          'averageCents', c.average_cents
        ) order by c.expense_cents desc, c.rows desc, c.concept), '[]'::jsonb)
        from concept_rollup c
      ),
      'accountSpend', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'accountId', a.account_id,
          'accountName', a.account_name,
          'expenseCents', a.expense_cents,
          'rows', a.rows,
          'averageCents', a.average_cents
        ) order by a.expense_cents desc, a.account_name), '[]'::jsonb)
        from account_rollup a
      ),
      'topTransactions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'transactionId', t.transaction_id,
          'bankDate', t.bank_date,
          'amountCents', t.amount_cents,
          'conceptNormalized', t.concept_normalized,
          'merchantId', t.merchant_id,
          'merchantName', t.merchant_name,
          'categoryId', t.category_id,
          'categoryName', t.category_name,
          'accountId', t.account_id,
          'accountName', t.account_name
        ) order by t.amount_cents desc, t.bank_date desc, t.transaction_id), '[]'::jsonb)
        from top_transactions t
      ),
      'concentration', jsonb_build_object(
        'top3CategoryBps', (
          select case when t.expense_cents > 0
            then round((coalesce(sum(x.current_cents), 0)::numeric * 10000) / t.expense_cents)::int
            else null
          end
          from current_total t
          cross join lateral (
            select current_cents from category_rollup where current_cents > 0 order by current_cents desc limit 3
          ) x
          group by t.expense_cents
        ),
        'top3MerchantBps', (
          select case when t.expense_cents > 0
            then round((coalesce(sum(x.current_cents), 0)::numeric * 10000) / t.expense_cents)::int
            else null
          end
          from current_total t
          cross join lateral (
            select current_cents from merchant_rollup where current_cents > 0 order by current_cents desc limit 3
          ) x
          group by t.expense_cents
        )
      ),
      'anomalies', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'transactionId', a.transaction_id,
          'bankDate', a.bank_date,
          'amountCents', a.amount_cents,
          'merchantId', a.merchant_id,
          'merchantName', a.merchant_name,
          'categoryId', a.category_id,
          'categoryName', a.category_name,
          'conceptNormalized', a.concept_normalized,
          'habitualCents', a.habitual_cents,
          'historyRows', a.history_rows,
          'variationBps', a.variation_bps
        ) order by (a.amount_cents - a.habitual_cents) desc, a.bank_date desc), '[]'::jsonb)
        from anomalies a
      ),
      'fixedVariable', (
        select jsonb_build_object(
          'available', s.reliable_recurrences > 0,
          'reliableRecurrences', s.reliable_recurrences,
          'fixedExpenseCents', s.fixed_expense_cents,
          'variableExpenseCents', greatest(t.expense_cents - s.fixed_expense_cents, 0)
        )
        from fixed_stats s cross join current_total t
      ),
      'budget', case when p.account_id is not null then null else (
        select jsonb_build_object(
          'month', p.budget_month,
          'total', jsonb_build_object(
            'automaticAmountCents', b.automatic_cents,
            'manualAmountCents', b.manual_amount_cents,
            'effectiveAmountCents', b.effective_cents,
            'actualExpenseCents', b.actual_cents,
            'remainingCents', b.effective_cents - b.actual_cents,
            'progressBps', case when b.effective_cents > 0
              then round((b.actual_cents::numeric * 10000) / b.effective_cents)::int
              else null
            end,
            'status', case
              when b.effective_cents = 0 and b.actual_cents = 0 then 'empty'
              when b.effective_cents = 0 and b.actual_cents > 0 then 'unfunded'
              when b.actual_cents > b.effective_cents then 'over'
              else 'on_track'
            end
          ),
          'overCategories', jsonb_build_array(),
          'categoryDetailDeferred', true
        )
        from budget_light b
      ) end,
      'forecast', case when p.date_to < p.today then null else (
        select jsonb_build_object(
          'period', jsonb_build_object(
            'dateFrom', greatest(p.today, p.date_from),
            'dateTo', p.forecast_date_to,
            'accountId', p.account_id
          ),
          'summary', jsonb_build_object(
            'plannedItems', f.planned_items,
            'projectedNetCents', f.net_cents,
            'projectedIncomeCents', f.income_cents,
            'projectedExpenseCents', f.expense_cents,
            'projectedClosingBalanceCents', null,
            'openingBalanceCents', null
          ),
          'detailDeferred', true
        )
        from forecast_light f
      ) end
    ) as result
    from bounds p
  `;
}
