begin;

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
        recurrence_id = excluded.recurrence_id,
        excluded = case
          when forecast_items.excluded_reason = 'Proyección recurrente sustituida al recalcular' then false
          else forecast_items.excluded
        end,
        excluded_reason = case
          when forecast_items.excluded_reason = 'Proyección recurrente sustituida al recalcular' then ''
          else forecast_items.excluded_reason
        end;

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

revoke all on function financial_app.refresh_recurring_forecast(date,date,uuid) from public, anon, authenticated;
grant execute on function financial_app.refresh_recurring_forecast(date,date,uuid) to service_role;

commit;
