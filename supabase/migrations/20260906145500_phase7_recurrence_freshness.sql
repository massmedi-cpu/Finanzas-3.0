begin;

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
  ), scheduled as (
    select
      c.*,
      schedule.intervals_ahead,
      schedule.next_estimated_date,
      greatest(schedule.intervals_ahead - 1, 0)::integer as missed_cycles
    from classified c
    cross join lateral (
      select
        g.n::integer as intervals_ahead,
        (
          case
            when c.interval_unit = 'week'
              then c.last_observed_date + (7 * c.interval_count * g.n)
            when c.interval_unit = 'month'
              then (c.last_observed_date + make_interval(months => c.interval_count * g.n))::date
            when c.interval_unit = 'quarter'
              then (c.last_observed_date + make_interval(months => 3 * c.interval_count * g.n))::date
            when c.interval_unit = 'year'
              then (c.last_observed_date + make_interval(years => c.interval_count * g.n))::date
            else null
          end
        )::date as next_estimated_date
      from generate_series(1, 5200) as g(n)
      where (
        case
          when c.interval_unit = 'week'
            then c.last_observed_date + (7 * c.interval_count * g.n)
          when c.interval_unit = 'month'
            then (c.last_observed_date + make_interval(months => c.interval_count * g.n))::date
          when c.interval_unit = 'quarter'
            then (c.last_observed_date + make_interval(months => 3 * c.interval_count * g.n))::date
          when c.interval_unit = 'year'
            then (c.last_observed_date + make_interval(years => c.interval_count * g.n))::date
          else null
        end
      )::date > v_date_to
      order by g.n
      limit 1
    ) schedule
    where c.interval_unit is not null
  ), prepared as (
    select
      s.*,
      least(14, greatest(1, ceil(s.gap_deviation_days)::integer)) as date_tolerance_days,
      greatest(100::bigint, s.amount_deviation_cents) as amount_tolerance_cents,
      case
        when s.occurrence_count >= 5
          and s.gap_deviation_days <= 3
          and s.amount_deviation_cents <= greatest(100::bigint, round(abs(s.usual_amount_cents)::numeric * 0.05)::bigint)
          then 'high'
        when s.occurrence_count >= 4
          and s.gap_deviation_days <= 7
          and s.amount_deviation_cents <= greatest(300::bigint, round(abs(s.usual_amount_cents)::numeric * 0.15)::bigint)
          then 'medium'
        else 'low'
      end as observed_confidence
    from scheduled s
  ), scored as (
    select
      p.*,
      case
        when p.missed_cycles >= 2 then 'low'
        when p.missed_cycles = 1 and p.observed_confidence = 'high' then 'medium'
        else p.observed_confidence
      end as confidence
    from prepared p
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
        'observedConfidence', p.observed_confidence,
        'occurrenceCount', p.occurrence_count,
        'firstObservedDate', p.first_observed_date,
        'lastObservedDate', p.last_observed_date,
        'nextEstimatedDate', p.next_estimated_date,
        'missedCycles', p.missed_cycles,
        'stale', p.missed_cycles > 0,
        'existingRecurrenceId', r.id,
        'existingStatus', r.status,
        'explanation', case
          when p.missed_cycles > 0 then
            format(
              'Patrón detectado sobre movimientos efectivos elegibles. Se han omitido %s vencimiento(s) teórico(s) desde la última aparición; la próxima fecha se proyecta después del periodo analizado y la confianza se penaliza cuando la ausencia es relevante. Ninguna detección se persiste automáticamente.',
              p.missed_cycles
            )
          else
            'Patrón detectado sobre movimientos efectivos elegibles. La confianza depende del número de ocurrencias y de la estabilidad observada de fecha e importe; la próxima fecha es posterior al periodo analizado y una coincidencia detectada no se persiste automáticamente.'
        end
      ) as item
    from scored p
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
        missed_cycles asc,
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
      'weakMatchesBecomeFacts', false,
      'nextDateAfterAnalysisPeriod', true,
      'missedCyclesReduceConfidence', true
    )
  );
end;
$$;

revoke all on function financial_app.recurrence_candidate_snapshot(date,date,integer) from public, anon, authenticated;
grant execute on function financial_app.recurrence_candidate_snapshot(date,date,integer) to service_role;

commit;
