begin;

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
    'forecast', v_row.id, 'created', null,
    jsonb_build_object('date',v_row.date,'amountCents',v_row.amount_cents,'concept',v_row.concept),
    'user'
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
      'forecast', p_id, 'excluded', to_jsonb(v_before), to_jsonb(p_excluded), 'user'
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

  return to_jsonb(v_item);
end;
$$;

commit;
