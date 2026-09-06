begin;

alter table financial_app.budgets
  drop constraint if exists budgets_automatic_amount_cents_check,
  drop constraint if exists budgets_manual_amount_cents_check,
  drop constraint if exists budgets_category_id_fkey;

alter table financial_app.budgets
  add constraint budgets_automatic_amount_cents_check
    check (automatic_amount_cents between 0 and 9007199254740991),
  add constraint budgets_manual_amount_cents_check
    check (manual_amount_cents is null or manual_amount_cents between 0 and 9007199254740991),
  add constraint budgets_category_id_fkey
    foreign key (category_id) references financial_app.categories(id) on delete restrict;

create index if not exists budgets_month_idx
  on financial_app.budgets (month, category_id);

create or replace function financial_app.validate_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.category_id is null then
    return new;
  end if;

  select c.kind into v_kind
  from financial_app.categories c
  where c.id = new.category_id;

  if v_kind is null then
    raise exception 'budget_category_not_found';
  end if;
  if v_kind <> 'expense' then
    raise exception 'budget_category_must_be_expense';
  end if;

  return new;
end;
$$;

drop trigger if exists budgets_validate_category on financial_app.budgets;
create trigger budgets_validate_category
before insert or update of category_id
on financial_app.budgets
for each row execute function financial_app.validate_budget_category();

create or replace function financial_app.budget_month_start(p_month text)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_year integer;
  v_month integer;
begin
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_budget_month';
  end if;

  v_year := substring(p_month from 1 for 4)::integer;
  v_month := substring(p_month from 6 for 2)::integer;
  if v_year < 1 then
    raise exception 'invalid_budget_month';
  end if;

  return make_date(v_year, v_month, 1);
end;
$$;

create or replace function financial_app.budget_category_scope(p_category_id uuid)
returns table(category_id uuid)
language sql
stable
set search_path = ''
as $$
  with recursive scope as (
    select c.id
    from financial_app.categories c
    where c.id = p_category_id and c.kind = 'expense'
    union all
    select child.id
    from financial_app.categories child
    join scope parent on child.parent_category_id = parent.id
    where child.kind = 'expense'
  )
  select id from scope
$$;

create or replace function financial_app.budget_month_actual(
  p_month text,
  p_category_id uuid default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_kind text;
  v_result bigint;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;

  if p_category_id is not null then
    select c.kind into v_kind from financial_app.categories c where c.id = p_category_id;
    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind <> 'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  select coalesce(-sum(f.amount_cents), 0)::bigint
    into v_result
  from financial_app.financial_transaction_facts(v_start, v_end, null) f
  where f.analytics_eligible
    and f.effective_kind = 'expense'
    and (
      p_category_id is null
      or f.effective_category_id in (
        select s.category_id from financial_app.budget_category_scope(p_category_id) s
      )
    );

  return coalesce(v_result, 0);
end;
$$;

create or replace function financial_app.budget_month_recommendation(
  p_month text,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start date;
  v_history_start date;
  v_history_end date;
  v_kind text;
  v_amount bigint;
  v_history jsonb;
  v_explanation text;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_history_start := (v_start - interval '3 months')::date;
  v_history_end := (v_start - interval '1 day')::date;

  if p_category_id is not null then
    select c.kind into v_kind from financial_app.categories c where c.id = p_category_id;
    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind <> 'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  with months as (
    select (v_start - (g.n || ' months')::interval)::date as month_start
    from generate_series(3, 1, -1) as g(n)
  ), facts as (
    select f.*
    from financial_app.financial_transaction_facts(v_history_start, v_history_end, null) f
    where f.analytics_eligible
      and f.effective_kind = 'expense'
      and (
        p_category_id is null
        or f.effective_category_id in (
          select s.category_id from financial_app.budget_category_scope(p_category_id) s
        )
      )
  ), monthly as (
    select
      m.month_start,
      coalesce(-sum(f.amount_cents), 0)::bigint as expense_cents
    from months m
    left join facts f
      on f.bank_date >= m.month_start
     and f.bank_date < (m.month_start + interval '1 month')::date
    group by m.month_start
  )
  select
    coalesce(round(avg(expense_cents::numeric)), 0)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(month_start, 'YYYY-MM'),
          'expenseCents', expense_cents
        ) order by month_start
      ),
      '[]'::jsonb
    )
  into v_amount, v_history
  from monthly;

  v_explanation := 'Media del gasto elegible de los 3 meses completos anteriores. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto; los reembolsos permanecen separados, igual que en el motor financiero central.';

  return jsonb_build_object(
    'automaticAmountCents', coalesce(v_amount, 0),
    'historyMonths', coalesce(v_history, '[]'::jsonb),
    'historyMonthCount', 3,
    'historyDateFrom', v_history_start,
    'historyDateTo', v_history_end,
    'explanation', v_explanation
  );
end;
$$;

create or replace function financial_app.budget_month_snapshot(p_month text)
returns jsonb
language plpgsql
stable
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
      'recommendation', 'trailing_3_complete_month_average',
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

create or replace function financial_app.refresh_budget_month(p_month text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_candidate record;
  v_rec jsonb;
  v_existing_id uuid;
begin
  perform financial_app.budget_month_start(p_month);
  lock table financial_app.budgets in share row exclusive mode;

  for v_candidate in
    select null::uuid as category_id
    union
    select c.id
    from financial_app.categories c
    where c.kind = 'expense' and c.lifecycle = 'active'
    union
    select b.category_id
    from financial_app.budgets b
    where b.month = p_month and b.category_id is not null
  loop
    v_rec := financial_app.budget_month_recommendation(p_month, v_candidate.category_id);

    select b.id into v_existing_id
    from financial_app.budgets b
    where b.month = p_month
      and b.category_id is not distinct from v_candidate.category_id;

    if v_existing_id is null then
      insert into financial_app.budgets(
        month, category_id, automatic_amount_cents, manual_amount_cents, explanation
      ) values (
        p_month,
        v_candidate.category_id,
        (v_rec->>'automaticAmountCents')::bigint,
        null,
        v_rec->>'explanation'
      );
    else
      update financial_app.budgets
      set automatic_amount_cents = (v_rec->>'automaticAmountCents')::bigint,
          explanation = v_rec->>'explanation'
      where id = v_existing_id;
    end if;
  end loop;

  return financial_app.budget_month_snapshot(p_month);
end;
$$;

create or replace function financial_app.set_budget_manual_amount(
  p_month text,
  p_category_id uuid,
  p_manual_amount_cents bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rec jsonb;
  v_budget_id uuid;
  v_old_manual bigint;
  v_kind text;
begin
  perform financial_app.budget_month_start(p_month);

  if p_manual_amount_cents is not null
     and (p_manual_amount_cents < 0 or p_manual_amount_cents > 9007199254740991) then
    raise exception 'invalid_budget_manual_amount';
  end if;

  if p_category_id is not null then
    select c.kind into v_kind from financial_app.categories c where c.id = p_category_id;
    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind <> 'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  lock table financial_app.budgets in share row exclusive mode;
  v_rec := financial_app.budget_month_recommendation(p_month, p_category_id);

  select b.id, b.manual_amount_cents
    into v_budget_id, v_old_manual
  from financial_app.budgets b
  where b.month = p_month
    and b.category_id is not distinct from p_category_id;

  if v_budget_id is null then
    insert into financial_app.budgets(
      month, category_id, automatic_amount_cents, manual_amount_cents, explanation
    ) values (
      p_month,
      p_category_id,
      (v_rec->>'automaticAmountCents')::bigint,
      p_manual_amount_cents,
      v_rec->>'explanation'
    )
    returning id into v_budget_id;
  else
    update financial_app.budgets
    set automatic_amount_cents = (v_rec->>'automaticAmountCents')::bigint,
        manual_amount_cents = p_manual_amount_cents,
        explanation = v_rec->>'explanation'
    where id = v_budget_id;
  end if;

  if v_old_manual is distinct from p_manual_amount_cents then
    insert into financial_app.audit_changes(
      entity_type, entity_id, field_name, original_value, new_value
    ) values (
      'budget',
      v_budget_id,
      'manual_amount_cents',
      case when v_old_manual is null then 'null'::jsonb else to_jsonb(v_old_manual) end,
      case when p_manual_amount_cents is null then 'null'::jsonb else to_jsonb(p_manual_amount_cents) end
    );
  end if;

  return financial_app.budget_month_snapshot(p_month);
end;
$$;

revoke all on function financial_app.validate_budget_category() from public, anon, authenticated;
revoke all on function financial_app.budget_month_start(text) from public, anon, authenticated;
revoke all on function financial_app.budget_category_scope(uuid) from public, anon, authenticated;
revoke all on function financial_app.budget_month_actual(text,uuid) from public, anon, authenticated;
revoke all on function financial_app.budget_month_recommendation(text,uuid) from public, anon, authenticated;
revoke all on function financial_app.budget_month_snapshot(text) from public, anon, authenticated;
revoke all on function financial_app.refresh_budget_month(text) from public, anon, authenticated;
revoke all on function financial_app.set_budget_manual_amount(text,uuid,bigint) from public, anon, authenticated;

grant execute on function financial_app.budget_month_start(text) to service_role;
grant execute on function financial_app.budget_category_scope(uuid) to service_role;
grant execute on function financial_app.budget_month_actual(text,uuid) to service_role;
grant execute on function financial_app.budget_month_recommendation(text,uuid) to service_role;
grant execute on function financial_app.budget_month_snapshot(text) to service_role;
grant execute on function financial_app.refresh_budget_month(text) to service_role;
grant execute on function financial_app.set_budget_manual_amount(text,uuid,bigint) to service_role;

commit;
