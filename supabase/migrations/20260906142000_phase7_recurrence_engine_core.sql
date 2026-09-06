begin;

alter table financial_app.recurrences
  add column if not exists confidence text not null default 'low',
  add column if not exists occurrence_count integer not null default 0,
  add column if not exists date_tolerance_days integer not null default 3,
  add column if not exists last_observed_date date,
  add column if not exists last_recalculated_at timestamptz;

alter table financial_app.recurrences
  drop constraint if exists recurrences_confidence_check,
  drop constraint if exists recurrences_occurrence_count_check,
  drop constraint if exists recurrences_date_tolerance_days_check;

alter table financial_app.recurrences
  add constraint recurrences_confidence_check
    check (confidence in ('high','medium','low')),
  add constraint recurrences_occurrence_count_check
    check (occurrence_count >= 0),
  add constraint recurrences_date_tolerance_days_check
    check (date_tolerance_days between 0 and 31);

create index if not exists recurrences_status_next_idx
  on financial_app.recurrences (status, next_estimated_date, id);

create index if not exists recurrences_match_idx
  on financial_app.recurrences (account_id, merchant_id, category_id, interval_unit, interval_count);

create or replace function financial_app.recurrence_candidate_snapshot(
  p_date_from date default null,
  p_date_to date default null,
  p_min_occurrences integer default 3
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date_to date := coalesce(p_date_to, current_date);
  v_candidates jsonb;
begin
  if p_date_from is not null and p_date_from > v_date_to then
    raise exception 'invalid_recurrence_date_range';
  end if;
  if p_min_occurrences < 3 or p_min_occurrences > 24 then
    raise exception 'invalid_recurrence_min_occurrences';
  end if;

  with eligible as (
    select
      f.transaction_id,
      f.account_id,
      f.bank_date,
      f.amount_cents,
      f.effective_kind,
      f.effective_merchant_id,
      f.effective_category_id,
      financial_app.normalize_label(
        coalesce(nullif(btrim(o.concept_override), ''), t.concept_normalized)
      ) as concept_key
    from financial_app.financial_transaction_facts(p_date_from, v_date_to, null) f
    join financial_app.transactions t on t.id = f.transaction_id
    left join financial_app.transaction_overrides o on o.transaction_id = t.id
    where f.analytics_eligible
      and f.effective_kind in ('income','expense')
  ), sequenced as (
    select
      e.*,
      (e.bank_date - lag(e.bank_date) over (
        partition by
          e.account_id,
          e.effective_merchant_id,
          e.effective_category_id,
          e.effective_kind,
          e.concept_key
        order by e.bank_date, e.transaction_id
      ))::integer as gap_days
    from eligible e
    where e.concept_key <> ''
  ), stats as (
    select
      account_id,
      effective_merchant_id,
      effective_category_id,
      effective_kind,
      concept_key,
      count(*)::integer as occurrence_count,
      min(bank_date) as first_observed_date,
      max(bank_date) as last_observed_date,
      round(percentile_cont(0.5) within group (order by amount_cents))::bigint as usual_amount_cents,
      min(amount_cents)::bigint as min_amount_cents,
      max(amount_cents)::bigint as max_amount_cents,
      percentile_cont(0.5) within group (order by gap_days) filter (where gap_days is not null) as median_gap_days,
      min(gap_days) filter (where gap_days is not null) as min_gap_days,
      max(gap_days) filter (where gap_days is not null) as max_gap_days
    from sequenced
    group by 1,2,3,4,5
    having count(*) >= p_min_occurrences
  ), classified as (
    select
      s.*,
      case
        when s.median_gap_days between 6 and 8 then 'week'
        when s.median_gap_days between 13 and 15 then 'week'
        when s.median_gap_days between 26 and 35 then 'month'
        when s.median_gap_days between 80 and 100 then 'quarter'
        when s.median_gap_days between 330 and 400 then 'year'
        else null
      end as interval_unit,
      case
        when s.median_gap_days between 13 and 15 then 2
        when s.median_gap_days between 6 and 8
          or s.median_gap_days between 26 and 35
          or s.median_gap_days between 80 and 100
          or s.median_gap_days between 330 and 400 then 1
        else null
      end as interval_count,
      greatest(
        coalesce(s.median_gap_days - s.min_gap_days, 0),
        coalesce(s.max_gap_days - s.median_gap_days, 0)
      ) as gap_deviation_days,
      greatest(
        abs(s.usual_amount_cents - s.min_amount_cents),
        abs(s.max_amount_cents - s.usual_amount_cents)
      )::bigint as amount_deviation_cents
    from stats s
  ), prepared as (
    select
      c.*,
      least(14, greatest(1, ceil(c.gap_deviation_days)::integer)) as date_tolerance_days,
      greatest(100::bigint, c.amount_deviation_cents) as amount_tolerance_cents,
      case
        when c.occurrence_count >= 5
          and c.gap_deviation_days <= 3
          and c.amount_deviation_cents <= greatest(100::bigint, round(abs(c.usual_amount_cents)::numeric * 0.05)::bigint)
          then 'high'
        when c.occurrence_count >= 4
          and c.gap_deviation_days <= 7
          and c.amount_deviation_cents <= greatest(300::bigint, round(abs(c.usual_amount_cents)::numeric * 0.15)::bigint)
          then 'medium'
        else 'low'
      end as confidence,
      case
        when c.interval_unit = 'week' then c.last_observed_date + (7 * c.interval_count)
        when c.interval_unit = 'month' then (c.last_observed_date + make_interval(months => c.interval_count))::date
        when c.interval_unit = 'quarter' then (c.last_observed_date + make_interval(months => 3 * c.interval_count))::date
        when c.interval_unit = 'year' then (c.last_observed_date + make_interval(years => c.interval_count))::date
        else null
      end as next_estimated_date
    from classified c
    where c.interval_unit is not null
  ), projected as (
    select
      p.*,
      r.id as existing_recurrence_id,
      r.status as existing_status,
      jsonb_build_object(
        'candidateKey', md5(
          coalesce(p.account_id::text,'') || '|' ||
          coalesce(p.effective_merchant_id::text,'') || '|' ||
          coalesce(p.effective_category_id::text,'') || '|' ||
          p.effective_kind || '|' || p.concept_key || '|' ||
          p.interval_unit || '|' || p.interval_count::text
        ),
        'accountId', p.account_id,
        'merchantId', p.effective_merchant_id,
        'categoryId', p.effective_category_id,
        'kind', p.effective_kind,
        'conceptPattern', p.concept_key,
        'intervalUnit', p.interval_unit,
        'intervalCount', p.interval_count,
        'usualAmountCents', p.usual_amount_cents,
        'amountToleranceCents', p.amount_tolerance_cents,
        'dateToleranceDays', p.date_tolerance_days,
        'confidence', p.confidence,
        'occurrenceCount', p.occurrence_count,
        'firstObservedDate', p.first_observed_date,
        'lastObservedDate', p.last_observed_date,
        'nextEstimatedDate', p.next_estimated_date,
        'existingRecurrenceId', r.id,
        'existingStatus', r.status,
        'explanation', 'Patrón detectado sobre movimientos efectivos elegibles. La confianza depende del número de ocurrencias y de la estabilidad observada de fecha e importe; una coincidencia detectada no se persiste automáticamente.'
      ) as item
    from prepared p
    left join lateral (
      select rr.id, rr.status
      from financial_app.recurrences rr
      where rr.account_id is not distinct from p.account_id
        and rr.merchant_id is not distinct from p.effective_merchant_id
        and rr.category_id is not distinct from p.effective_category_id
        and financial_app.normalize_label(rr.concept_pattern) = p.concept_key
        and rr.interval_unit = p.interval_unit
        and rr.interval_count = p.interval_count
      order by rr.updated_at desc, rr.id
      limit 1
    ) r on true
  )
  select coalesce(
    jsonb_agg(
      item order by
        case confidence when 'high' then 0 when 'medium' then 1 else 2 end,
        occurrence_count desc,
        last_observed_date desc,
        concept_key
    ),
    '[]'::jsonb
  ) into v_candidates
  from projected;

  return jsonb_build_object(
    'contractVersion', 1,
    'dateFrom', p_date_from,
    'dateTo', v_date_to,
    'minOccurrences', p_min_occurrences,
    'candidateCount', jsonb_array_length(coalesce(v_candidates, '[]'::jsonb)),
    'candidates', coalesce(v_candidates, '[]'::jsonb),
    'principles', jsonb_build_object(
      'bankSource', 'read_only',
      'factSource', 'financial_transaction_facts',
      'eligibleKinds', jsonb_build_array('income','expense'),
      'automaticPersistence', false,
      'confidenceExplicit', true,
      'weakMatchesBecomeFacts', false
    )
  );
end;
$$;

create or replace function financial_app.save_recurrence(
  p_id uuid,
  p_account_id uuid,
  p_merchant_id uuid,
  p_category_id uuid,
  p_concept_pattern text,
  p_status text,
  p_interval_unit text,
  p_interval_count integer,
  p_usual_amount_cents bigint,
  p_amount_tolerance_cents bigint,
  p_date_tolerance_days integer,
  p_next_estimated_date date,
  p_confidence text,
  p_occurrence_count integer,
  p_last_observed_date date
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_concept text;
begin
  v_concept := financial_app.normalize_label(coalesce(p_concept_pattern, ''));
  if v_concept = '' then raise exception 'invalid_recurrence_concept'; end if;
  if p_status not in ('active','ignored','archived') then raise exception 'invalid_recurrence_status'; end if;
  if p_interval_unit not in ('week','month','quarter','year') then raise exception 'invalid_recurrence_interval_unit'; end if;
  if p_interval_count is null or p_interval_count <= 0 then raise exception 'invalid_recurrence_interval_count'; end if;
  if p_amount_tolerance_cents is null or p_amount_tolerance_cents < 0 then raise exception 'invalid_recurrence_amount_tolerance'; end if;
  if p_date_tolerance_days is null or p_date_tolerance_days < 0 or p_date_tolerance_days > 31 then raise exception 'invalid_recurrence_date_tolerance'; end if;
  if p_confidence not in ('high','medium','low') then raise exception 'invalid_recurrence_confidence'; end if;
  if p_occurrence_count is null or p_occurrence_count < 0 then raise exception 'invalid_recurrence_occurrence_count'; end if;

  lock table financial_app.recurrences in share row exclusive mode;

  if p_id is not null then
    select r.id, to_jsonb(r) into v_id, v_old
    from financial_app.recurrences r
    where r.id = p_id;
    if v_id is null then raise exception 'recurrence_not_found'; end if;
  else
    select r.id, to_jsonb(r) into v_id, v_old
    from financial_app.recurrences r
    where r.account_id is not distinct from p_account_id
      and r.merchant_id is not distinct from p_merchant_id
      and r.category_id is not distinct from p_category_id
      and financial_app.normalize_label(r.concept_pattern) = v_concept
      and r.interval_unit = p_interval_unit
      and r.interval_count = p_interval_count
    order by r.updated_at desc, r.id
    limit 1;
  end if;

  if v_id is null then
    insert into financial_app.recurrences(
      merchant_id, category_id, account_id, concept_pattern, status,
      interval_unit, interval_count, usual_amount_cents, amount_tolerance_cents,
      next_estimated_date, confidence, occurrence_count, date_tolerance_days,
      last_observed_date, last_recalculated_at
    ) values (
      p_merchant_id, p_category_id, p_account_id, v_concept, p_status,
      p_interval_unit, p_interval_count, p_usual_amount_cents, p_amount_tolerance_cents,
      p_next_estimated_date, p_confidence, p_occurrence_count, p_date_tolerance_days,
      p_last_observed_date, now()
    ) returning id into v_id;

    select to_jsonb(r) into v_new from financial_app.recurrences r where r.id = v_id;
    insert into financial_app.audit_changes(entity_type, entity_id, field_name, original_value, new_value)
    values ('recurrence', v_id, 'created', null, v_new);
  else
    update financial_app.recurrences
    set merchant_id = p_merchant_id,
        category_id = p_category_id,
        account_id = p_account_id,
        concept_pattern = v_concept,
        status = p_status,
        interval_unit = p_interval_unit,
        interval_count = p_interval_count,
        usual_amount_cents = p_usual_amount_cents,
        amount_tolerance_cents = p_amount_tolerance_cents,
        next_estimated_date = p_next_estimated_date,
        confidence = p_confidence,
        occurrence_count = p_occurrence_count,
        date_tolerance_days = p_date_tolerance_days,
        last_observed_date = p_last_observed_date,
        last_recalculated_at = now()
    where id = v_id;

    select to_jsonb(r) into v_new from financial_app.recurrences r where r.id = v_id;
    if v_old is distinct from v_new then
      insert into financial_app.audit_changes(entity_type, entity_id, field_name, original_value, new_value)
      values ('recurrence', v_id, 'recurrence_snapshot', v_old, v_new);
    end if;
  end if;

  return v_new;
end;
$$;

create or replace function financial_app.set_recurrence_status(
  p_id uuid,
  p_status text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
  v_row jsonb;
begin
  if p_status not in ('active','ignored','archived') then
    raise exception 'invalid_recurrence_status';
  end if;

  select status into v_old
  from financial_app.recurrences
  where id = p_id
  for update;

  if v_old is null then raise exception 'recurrence_not_found'; end if;

  if v_old is distinct from p_status then
    update financial_app.recurrences
    set status = p_status
    where id = p_id;

    insert into financial_app.audit_changes(entity_type, entity_id, field_name, original_value, new_value)
    values ('recurrence', p_id, 'status', to_jsonb(v_old), to_jsonb(p_status));
  end if;

  select to_jsonb(r) into v_row from financial_app.recurrences r where r.id = p_id;
  return v_row;
end;
$$;

revoke all on function financial_app.recurrence_candidate_snapshot(date,date,integer) from public, anon, authenticated;
revoke all on function financial_app.save_recurrence(uuid,uuid,uuid,uuid,text,text,text,integer,bigint,bigint,integer,date,text,integer,date) from public, anon, authenticated;
revoke all on function financial_app.set_recurrence_status(uuid,text) from public, anon, authenticated;

grant execute on function financial_app.recurrence_candidate_snapshot(date,date,integer) to service_role;
grant execute on function financial_app.save_recurrence(uuid,uuid,uuid,uuid,text,text,text,integer,bigint,bigint,integer,date,text,integer,date) to service_role;
grant execute on function financial_app.set_recurrence_status(uuid,text) to service_role;

commit;
