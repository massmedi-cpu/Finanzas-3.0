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
  if p_amount_cents is null or p_amount_cents = 0 or p_amount_cents < -9007199254740991 or p_amount_cents > 9007199254740991 then
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

revoke all on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text) to service_role;

commit;
