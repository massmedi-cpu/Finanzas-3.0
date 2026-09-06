begin;

alter table financial_app.forecast_items
  add column if not exists projection_key text,
  add column if not exists excluded_reason text not null default '',
  add column if not exists reconciliation_note text not null default '';

create unique index if not exists forecast_items_projection_key_unique
  on financial_app.forecast_items (projection_key)
  where projection_key is not null;

alter table financial_app.forecast_items
  drop constraint if exists forecast_items_projection_key_not_blank,
  add constraint forecast_items_projection_key_not_blank
    check (projection_key is null or btrim(projection_key) <> ''),
  drop constraint if exists forecast_items_excluded_reason_length,
  add constraint forecast_items_excluded_reason_length
    check (char_length(excluded_reason) <= 500),
  drop constraint if exists forecast_items_reconciliation_note_length,
  add constraint forecast_items_reconciliation_note_length
    check (char_length(reconciliation_note) <= 500);

create or replace function financial_app.forecast_interval_step(
  p_unit text,
  p_count integer
) returns interval
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_count <= 0 then
    raise exception 'invalid_forecast_interval_count';
  end if;
  case p_unit
    when 'week' then return make_interval(days => 7 * p_count);
    when 'month' then return make_interval(months => p_count);
    when 'quarter' then return make_interval(months => 3 * p_count);
    when 'year' then return make_interval(years => p_count);
    else raise exception 'invalid_forecast_interval_unit';
  end case;
end;
$$;

create or replace function financial_app.validate_forecast_range(
  p_date_from date,
  p_date_to date
) returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'invalid_forecast_date_range';
  end if;
  if p_date_to - p_date_from > 730 then
    raise exception 'forecast_date_range_too_large';
  end if;
end;
$$;

create or replace function financial_app.refresh_recurring_forecast(
  p_date_from date,
  p_date_to date,
  p_account_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  v_occurrence date;
  v_step interval;
  v_key text;
  v_generated_keys text[] := array[]::text[];
  v_generated integer := 0;
  v_superseded integer := 0;
  v_guard integer;
begin
  perform financial_app.validate_forecast_range(p_date_from, p_date_to);

  if p_account_id is not null and not exists (
    select 1 from financial_app.accounts a where a.id = p_account_id
  ) then
    raise exception 'forecast_account_not_found';
  end if;

  for r in
    select id, account_id, category_id, merchant_id, concept_pattern,
           interval_unit, interval_count, usual_amount_cents,
           next_estimated_date, confidence
    from financial_app.recurrences
    where status = 'active'
      and next_estimated_date is not null
      and (p_account_id is null or account_id = p_account_id)
    order by id
  loop
    v_occurrence := r.next_estimated_date;
    v_step := financial_app.forecast_interval_step(r.interval_unit, r.interval_count);
    v_guard := 0;

    while v_occurrence < p_date_from loop
      v_occurrence := (v_occurrence::timestamp + v_step)::date;
      v_guard := v_guard + 1;
      if v_guard > 10000 then raise exception 'forecast_projection_guard'; end if;
    end loop;

    while v_occurrence <= p_date_to loop
      v_key := format('recurrence:%s:%s', r.id, v_occurrence);
      v_generated_keys := array_append(v_generated_keys, v_key);

      insert into financial_app.forecast_items(
        date, account_id, category_id, merchant_id, concept, amount_cents,
        origin, confidence, recurrence_id, budget_id, confirmed_transaction_id,
        excluded, projection_key, excluded_reason, reconciliation_note
      ) values (
        v_occurrence, r.account_id, r.category_id, r.merchant_id,
        r.concept_pattern, r.usual_amount_cents, 'recurring', r.confidence,
        r.id, null, null, false, v_key, '', ''
      )
      on conflict (projection_key) where projection_key is not null
      do update set
        date = excluded.date,
        account_id = excluded.account_id,
        category_id = excluded.category_id,
        merchant_id = excluded.merchant_id,
        concept = excluded.concept,
        amount_cents = excluded.amount_cents,
        origin = 'recurring',
        confidence = excluded.confidence,
        recurrence_id = excluded.recurrence_id;

      v_generated := v_generated + 1;
      v_occurrence := (v_occurrence::timestamp + v_step)::date;
      v_guard := v_guard + 1;
      if v_guard > 10000 then raise exception 'forecast_projection_guard'; end if;
    end loop;
  end loop;

  update financial_app.forecast_items fi
  set excluded = true,
      excluded_reason = case
        when fi.excluded_reason = '' then 'Proyección recurrente sustituida al recalcular'
        else fi.excluded_reason
      end
  where fi.origin = 'recurring'
    and fi.confirmed_transaction_id is null
    and fi.date between p_date_from and p_date_to
    and (p_account_id is null or fi.account_id = p_account_id)
    and (fi.projection_key is null or not (fi.projection_key = any(v_generated_keys)));
  get diagnostics v_superseded = row_count;

  return jsonb_build_object(
    'generated', v_generated,
    'superseded', v_superseded,
    'dateFrom', p_date_from,
    'dateTo', p_date_to,
    'accountId', p_account_id
  );
end;
$$;

create or replace function financial_app.save_manual_forecast_item(
  p_date date,
  p_concept text,
  p_amount_cents bigint,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_merchant_id uuid default null,
  p_confidence text default 'high'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row financial_app.forecast_items%rowtype;
begin
  if p_date is null then raise exception 'invalid_forecast_date'; end if;
  if p_concept is null or btrim(p_concept) = '' or char_length(btrim(p_concept)) > 240 then
    raise exception 'invalid_forecast_concept';
  end if;
  if p_amount_cents is null or p_amount_cents < -9007199254740991 or p_amount_cents > 9007199254740991 then
    raise exception 'invalid_forecast_amount';
  end if;
  if p_confidence not in ('high','medium','low') then raise exception 'invalid_forecast_confidence'; end if;
  if p_account_id is not null and not exists (select 1 from financial_app.accounts where id=p_account_id) then
    raise exception 'forecast_account_not_found';
  end if;
  if p_category_id is not null and not exists (select 1 from financial_app.categories where id=p_category_id) then
    raise exception 'forecast_category_not_found';
  end if;
  if p_merchant_id is not null and not exists (select 1 from financial_app.merchants where id=p_merchant_id) then
    raise exception 'forecast_merchant_not_found';
  end if;

  insert into financial_app.forecast_items(
    date, account_id, category_id, merchant_id, concept, amount_cents,
    origin, confidence, excluded, projection_key, excluded_reason, reconciliation_note
  ) values (
    p_date, p_account_id, p_category_id, p_merchant_id, btrim(p_concept),
    p_amount_cents, 'manual', p_confidence, false, null, '', ''
  ) returning * into v_row;

  insert into financial_app.audit_changes(
    entity_type, entity_id, field_name, original_value, new_value, change_origin
  ) values (
    'forecast_item', v_row.id, 'created', null,
    jsonb_build_object('date',v_row.date,'amountCents',v_row.amount_cents,'concept',v_row.concept),
    'manual'
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function financial_app.set_forecast_item_excluded(
  p_id uuid,
  p_excluded boolean,
  p_reason text default ''
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row financial_app.forecast_items%rowtype;
  v_before boolean;
begin
  if p_id is null then raise exception 'invalid_forecast_item_id'; end if;
  if p_excluded is null then raise exception 'invalid_forecast_excluded'; end if;
  if p_reason is null or char_length(p_reason) > 500 then raise exception 'invalid_forecast_excluded_reason'; end if;
  if p_excluded and btrim(p_reason) = '' then raise exception 'forecast_exclusion_reason_required'; end if;

  select excluded into v_before from financial_app.forecast_items where id=p_id for update;
  if not found then raise exception 'forecast_item_not_found'; end if;

  update financial_app.forecast_items
  set excluded=p_excluded,
      excluded_reason=case when p_excluded then btrim(p_reason) else '' end
  where id=p_id
  returning * into v_row;

  if v_before is distinct from p_excluded then
    insert into financial_app.audit_changes(
      entity_type, entity_id, field_name, original_value, new_value, change_origin
    ) values (
      'forecast_item', p_id, 'excluded', to_jsonb(v_before), to_jsonb(p_excluded), 'manual'
    );
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function financial_app.reconcile_forecast_item(
  p_id uuid,
  p_transaction_id uuid,
  p_note text default ''
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item financial_app.forecast_items%rowtype;
  v_fact record;
  v_old uuid;
begin
  if p_id is null then raise exception 'invalid_forecast_item_id'; end if;
  if p_note is null or char_length(p_note) > 500 then raise exception 'invalid_forecast_reconciliation_note'; end if;

  select * into v_item from financial_app.forecast_items where id=p_id for update;
  if not found then raise exception 'forecast_item_not_found'; end if;
  v_old := v_item.confirmed_transaction_id;

  if p_transaction_id is not null then
    select * into v_fact
    from financial_app.financial_transaction_facts()
    where transaction_id=p_transaction_id;
    if not found then raise exception 'forecast_transaction_not_found'; end if;
    if v_item.account_id is not null and v_fact.account_id <> v_item.account_id then
      raise exception 'forecast_reconciliation_account_mismatch';
    end if;
    if (v_item.amount_cents < 0) <> (v_fact.amount_cents < 0) then
      raise exception 'forecast_reconciliation_sign_mismatch';
    end if;
  end if;

  update financial_app.forecast_items
  set confirmed_transaction_id=p_transaction_id,
      reconciliation_note=case when p_transaction_id is null then '' else btrim(p_note) end
  where id=p_id
  returning * into v_item;

  if v_old is distinct from p_transaction_id then
    insert into financial_app.audit_changes(
      entity_type, entity_id, field_name, original_value, new_value, change_origin
    ) values (
      'forecast_item', p_id, 'confirmed_transaction_id', to_jsonb(v_old), to_jsonb(p_transaction_id), 'manual'
    );
  end if;

  return to_jsonb(v_item);
end;
$$;

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

  if p_account_id is not null and not exists (select 1 from financial_app.accounts where id=p_account_id) then
    raise exception 'forecast_account_not_found';
  end if;

  select financial_app.financial_account_balances(p_date_from - 1, false, p_account_id)
  into v_balances;
  v_opening := coalesce((v_balances->>'totalBalanceCents')::bigint,0);

  with base as (
    select
      fi.*,
      a.name as account_name,
      c.name as category_name,
      m.canonical_name as merchant_name,
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
    left join financial_app.financial_transaction_facts() f on f.transaction_id=fi.confirmed_transaction_id
    where fi.date between p_date_from and p_date_to
      and (p_account_id is null or fi.account_id=p_account_id)
  ), running as (
    select *,
      v_opening + sum(projection_effect_cents) over(order by date,id rows unbounded preceding) as projected_balance_after_cents
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
  ), snaps as (
    select month, financial_app.budget_month_snapshot(month) as snapshot from months
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',month,
    'budgetCents',coalesce((snapshot->'total'->>'effectiveAmountCents')::bigint,0),
    'actualExpenseCents',coalesce((snapshot->'total'->>'actualExpenseCents')::bigint,0),
    'remainingCents',coalesce((snapshot->'total'->>'remainingCents')::bigint,0),
    'status',snapshot->'total'->>'status'
  ) order by month),'[]'::jsonb)
  into v_budgets
  from snaps;

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
      'openingBalanceSource','financial_account_balances',
      'recurrenceSource','active_recurrences_only',
      'budgetsCreateDatedItems',false,
      'excludedItemsAffectCashFlow',false,
      'confirmedItemsAffectCashFlow',false,
      'getHasSideEffects',false
    )
  );
end;
$$;

revoke all on function financial_app.forecast_interval_step(text,integer) from public, anon, authenticated;
revoke all on function financial_app.validate_forecast_range(date,date) from public, anon, authenticated;
revoke all on function financial_app.refresh_recurring_forecast(date,date,uuid) from public, anon, authenticated;
revoke all on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.set_forecast_item_excluded(uuid,boolean,text) from public, anon, authenticated;
revoke all on function financial_app.reconcile_forecast_item(uuid,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.forecast_snapshot(date,date,uuid) from public, anon, authenticated;

grant execute on function financial_app.forecast_interval_step(text,integer) to service_role;
grant execute on function financial_app.validate_forecast_range(date,date) to service_role;
grant execute on function financial_app.refresh_recurring_forecast(date,date,uuid) to service_role;
grant execute on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text) to service_role;
grant execute on function financial_app.set_forecast_item_excluded(uuid,boolean,text) to service_role;
grant execute on function financial_app.reconcile_forecast_item(uuid,uuid,text) to service_role;
grant execute on function financial_app.forecast_snapshot(date,date,uuid) to service_role;

commit;
