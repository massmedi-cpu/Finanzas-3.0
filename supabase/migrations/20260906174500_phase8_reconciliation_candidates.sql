begin;

create unique index if not exists forecast_items_confirmed_transaction_unique
  on financial_app.forecast_items (confirmed_transaction_id)
  where confirmed_transaction_id is not null;

create or replace function financial_app.forecast_reconciliation_candidates(
  p_id uuid,
  p_days integer default 7,
  p_limit integer default 8
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_item financial_app.forecast_items%rowtype;
  v_rows jsonb;
begin
  if p_id is null then raise exception 'invalid_forecast_item_id'; end if;
  if p_days is null or p_days < 0 or p_days > 31 then raise exception 'invalid_forecast_candidate_days'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid_forecast_candidate_limit'; end if;

  select * into v_item
  from financial_app.forecast_items
  where id=p_id;
  if not found then raise exception 'forecast_item_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId',q.transaction_id,
    'date',q.bank_date,
    'amountCents',q.amount_cents,
    'differenceCents',q.difference_cents,
    'dayDifference',q.day_difference,
    'accountId',q.account_id,
    'categoryId',q.effective_category_id,
    'merchantId',q.effective_merchant_id,
    'concept',q.concept_original
  ) order by q.difference_cents,q.day_difference,q.bank_date desc,q.transaction_id),'[]'::jsonb)
  into v_rows
  from (
    select
      f.transaction_id,
      f.bank_date,
      f.amount_cents,
      abs(f.amount_cents - v_item.amount_cents)::bigint as difference_cents,
      abs(f.bank_date - v_item.date)::int as day_difference,
      f.account_id,
      f.effective_category_id,
      f.effective_merchant_id,
      sr.concept_original
    from financial_app.financial_transaction_facts(
      v_item.date - p_days,
      v_item.date + p_days,
      v_item.account_id
    ) f
    join financial_app.transactions t on t.id=f.transaction_id
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    where f.analytics_eligible=true
      and f.effective_kind <> 'transfer'
      and (v_item.amount_cents < 0) = (f.amount_cents < 0)
      and not exists (
        select 1
        from financial_app.forecast_items other
        where other.confirmed_transaction_id=f.transaction_id
          and other.id<>v_item.id
      )
    order by
      abs(f.amount_cents - v_item.amount_cents),
      abs(f.bank_date - v_item.date),
      f.bank_date desc,
      f.transaction_id
    limit p_limit
  ) q;

  return jsonb_build_object(
    'forecastItemId',v_item.id,
    'forecastDate',v_item.date,
    'forecastAmountCents',v_item.amount_cents,
    'days',p_days,
    'candidates',v_rows,
    'principles',jsonb_build_object(
      'factSource','financial_transaction_facts',
      'bankSource','read_only',
      'eligibleOnly',true,
      'transfersExcluded',true,
      'sameSignOnly',true,
      'oneTransactionPerForecast',true
    )
  );
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
    if exists (
      select 1 from financial_app.forecast_items other
      where other.confirmed_transaction_id=p_transaction_id
        and other.id<>p_id
    ) then
      raise exception 'forecast_transaction_already_reconciled';
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

  return to_jsonb(v_item);
end;
$$;

revoke all on function financial_app.forecast_reconciliation_candidates(uuid,integer,integer) from public, anon, authenticated;
grant execute on function financial_app.forecast_reconciliation_candidates(uuid,integer,integer) to service_role;

commit;
