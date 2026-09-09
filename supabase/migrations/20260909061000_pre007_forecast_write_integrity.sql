begin;

alter table financial_app.forecast_items
  add column if not exists idempotency_key uuid;

create unique index if not exists forecast_items_idempotency_key_unique
  on financial_app.forecast_items (idempotency_key)
  where idempotency_key is not null;

create or replace function financial_app.save_manual_forecast_item(
  p_date date,
  p_concept text,
  p_amount_cents bigint,
  p_account_id uuid,
  p_category_id uuid,
  p_merchant_id uuid,
  p_confidence text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row financial_app.forecast_items%rowtype;
  v_inserted boolean := false;
begin
  if p_date is null then raise exception 'invalid_forecast_date'; end if;
  if p_concept is null or btrim(p_concept) = '' or char_length(btrim(p_concept)) > 240 then
    raise exception 'invalid_forecast_concept';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 or p_amount_cents < -9007199254740991 or p_amount_cents > 9007199254740991 then
    raise exception 'invalid_forecast_amount';
  end if;
  if p_confidence not in ('high','medium','low') then raise exception 'invalid_forecast_confidence'; end if;
  if p_idempotency_key is null then raise exception 'invalid_forecast_idempotency_key'; end if;
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
    origin, confidence, excluded, projection_key, excluded_reason, reconciliation_note,
    idempotency_key
  ) values (
    p_date, p_account_id, p_category_id, p_merchant_id, btrim(p_concept),
    p_amount_cents, 'manual', p_confidence, false, null, '', '', p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_row;

  if found then
    v_inserted := true;
  else
    select * into v_row
    from financial_app.forecast_items
    where idempotency_key = p_idempotency_key;

    if not found then raise exception 'forecast_idempotency_conflict'; end if;
  end if;

  if v_row.origin is distinct from 'manual'
    or v_row.date is distinct from p_date
    or v_row.concept is distinct from btrim(p_concept)
    or v_row.amount_cents is distinct from p_amount_cents
    or v_row.account_id is distinct from p_account_id
    or v_row.category_id is distinct from p_category_id
    or v_row.merchant_id is distinct from p_merchant_id
    or v_row.confidence is distinct from p_confidence
  then
    raise exception 'forecast_idempotency_conflict';
  end if;

  if v_inserted then
    insert into financial_app.audit_changes(
      entity_type, entity_id, field_name, original_value, new_value, change_origin
    ) values (
      'forecast', v_row.id, 'created', null,
      jsonb_build_object('date',v_row.date,'amountCents',v_row.amount_cents,'concept',v_row.concept),
      'user'
    );
  end if;

  return to_jsonb(v_row) || jsonb_build_object(
    'idempotencyKey', v_row.idempotency_key,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function financial_app.set_forecast_item_excluded(
  p_id uuid,
  p_excluded boolean,
  p_reason text,
  p_expected_updated_at timestamptz
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
  if p_expected_updated_at is null then raise exception 'invalid_forecast_expected_updated_at'; end if;

  select * into v_row from financial_app.forecast_items where id=p_id for update;
  if not found then raise exception 'forecast_item_not_found'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'forecast_write_conflict';
  end if;
  v_before := v_row.excluded;

  update financial_app.forecast_items
  set excluded=p_excluded,
      excluded_reason=case when p_excluded then btrim(p_reason) else '' end
  where id=p_id
  returning * into v_row;

  if v_before is distinct from p_excluded then
    insert into financial_app.audit_changes(
      entity_type, entity_id, field_name, original_value, new_value, change_origin
    ) values (
      'forecast', p_id, 'excluded', to_jsonb(v_before), to_jsonb(p_excluded), 'user'
    );
  end if;

  return to_jsonb(v_row) || jsonb_build_object('updatedAt', v_row.updated_at);
end;
$$;

create or replace function financial_app.reconcile_forecast_item(
  p_id uuid,
  p_transaction_id uuid,
  p_note text,
  p_expected_updated_at timestamptz
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
  if p_expected_updated_at is null then raise exception 'invalid_forecast_expected_updated_at'; end if;

  select * into v_item from financial_app.forecast_items where id=p_id for update;
  if not found then raise exception 'forecast_item_not_found'; end if;
  if v_item.updated_at is distinct from p_expected_updated_at then
    raise exception 'forecast_write_conflict';
  end if;
  v_old := v_item.confirmed_transaction_id;

  if p_transaction_id is not null then
    select * into v_fact
    from financial_app.financial_transaction_facts()
    where transaction_id=p_transaction_id;
    if not found then raise exception 'forecast_transaction_not_found'; end if;
    if not coalesce(v_fact.analytics_eligible,false) then
      raise exception 'forecast_reconciliation_transaction_ineligible';
    end if;
    if v_fact.effective_kind = 'transfer' then
      raise exception 'forecast_reconciliation_transfer_not_allowed';
    end if;
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
      'forecast', p_id, 'confirmed_transaction_id', to_jsonb(v_old), to_jsonb(p_transaction_id), 'user'
    );
  end if;

  return to_jsonb(v_item) || jsonb_build_object('updatedAt', v_item.updated_at);
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

revoke all on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function financial_app.set_forecast_item_excluded(uuid,boolean,text,timestamptz) from public, anon, authenticated;
revoke all on function financial_app.reconcile_forecast_item(uuid,uuid,text,timestamptz) from public, anon, authenticated;

grant execute on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function financial_app.set_forecast_item_excluded(uuid,boolean,text,timestamptz) to service_role;
grant execute on function financial_app.reconcile_forecast_item(uuid,uuid,text,timestamptz) to service_role;

commit;
