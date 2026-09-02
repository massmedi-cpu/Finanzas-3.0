-- Financial App 9.0.0 · narrow authorized read boundary for obligation identity
-- The precision core stays SECURITY INVOKER. Only these two helpers need table reads.

create or replace function financial_app.forecast_enrich_annual_obligation_evidence(p_event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'financial_app', 'auth'
as $function$
declare
  v_source_text text;
  v_source_id uuid;
  v_account_id uuid;
  v_anchor_date date;
  v_anchor_amount numeric;
  v_original_concept text;
  v_fallback text;
  v_fingerprint text;
  v_identity_source text;
  v_observations integer:=0;
  v_years integer:=0;
  v_occurrences_per_year numeric;
  v_existing_conf numeric:=0;
  v_evidence_conf numeric:=0;
  v_explanation jsonb;
begin
  if financial_app.authorized_email() is null then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if coalesce(p_event->>'source','automatic')<>'automatic' then return p_event; end if;
  if not financial_app.forecast_is_annual_signal(p_event->>'category',p_event->>'subcategory',p_event->>'title')
     and coalesce(p_event#>>'{explanation,source}','') not in ('previous_year_seasonal','annual_tax_insurance_history') then
    return p_event;
  end if;

  v_source_text:=substring(coalesce(p_event->>'id','') from '^seasonal:([0-9a-fA-F-]{36}):');
  if v_source_text is null then
    v_source_text:=substring(coalesce(p_event->>'id','') from '^annual-history:([0-9a-fA-F-]{36}):');
  end if;
  if v_source_text is null then return p_event; end if;

  begin
    v_source_id:=v_source_text::uuid;
  exception when invalid_text_representation then
    return p_event;
  end;

  select
    t.account_id,
    coalesce(t.effective_date,t.source_date)::date,
    coalesce(t.personal_amount_override,t.source_amount)::numeric,
    coalesce(t.source_original_concept,''),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
  into v_account_id,v_anchor_date,v_anchor_amount,v_original_concept,v_fallback
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where t.id=v_source_id
    and a.account_role='operating'
    and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false;

  if not found then return p_event; end if;
  v_fingerprint:=financial_app.forecast_obligation_fingerprint(v_original_concept,v_fallback);
  if coalesce(v_fingerprint,'')='' then return p_event; end if;
  v_identity_source:=case when v_fingerprint like 'bank_mandate:%' then 'bank_mandate' else 'normalized_counterparty' end;

  with identity_rows as(
    select
      coalesce(t.effective_date,t.source_date)::date d,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.account_id=v_account_id
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.personal_amount_override,t.source_amount)<=-5
      and coalesce(t.effective_date,t.source_date) between current_date-2190 and current_date
      and financial_app.forecast_obligation_fingerprint(
        coalesce(t.source_original_concept,''),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )=v_fingerprint
      and financial_app.forecast_is_annual_signal(
        coalesce(t.category_override,t.source_category),
        coalesce(t.subcategory_override,t.source_subcategory),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )
  ), seasonal_rows as(
    select d,amount
    from identity_rows
    where least(abs(extract(doy from d)-extract(doy from v_anchor_date)),366-abs(extract(doy from d)-extract(doy from v_anchor_date)))<=35
      and abs(abs(amount)-abs(v_anchor_amount))<=greatest(2::numeric,greatest(abs(amount),abs(v_anchor_amount))*.12)
  )
  select count(*)::int,count(distinct extract(year from d))::int
  into v_observations,v_years
  from seasonal_rows;

  if v_identity_source='bank_mandate' then
    with identity_rows as(
      select coalesce(t.effective_date,t.source_date)::date d
      from financial_app.transactions t
      join financial_app.accounts a on a.id=t.account_id
      where a.account_role='operating'
        and t.account_id=v_account_id
        and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
        and coalesce(t.personal_amount_override,t.source_amount)<=-5
        and coalesce(t.effective_date,t.source_date) between current_date-2190 and current_date
        and extract(year from coalesce(t.effective_date,t.source_date))<extract(year from current_date)
        and financial_app.forecast_obligation_fingerprint(
          coalesce(t.source_original_concept,''),
          coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
        )=v_fingerprint
        and financial_app.forecast_is_annual_signal(
          coalesce(t.category_override,t.source_category),
          coalesce(t.subcategory_override,t.source_subcategory),
          coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
        )
    ), year_counts as(
      select extract(year from d)::int y,count(*)::int c
      from identity_rows
      group by extract(year from d)::int
    )
    select percentile_disc(.5) within group(order by c)::numeric
    into v_occurrences_per_year
    from year_counts;
  end if;

  if coalesce(p_event->>'confidence','') ~ '^\d+(\.\d+)?$' then
    v_existing_conf:=(p_event->>'confidence')::numeric;
  end if;
  v_evidence_conf:=case
    when v_years>=4 then .88
    when v_years=3 then .84
    when v_years=2 then .78
    else v_existing_conf
  end;

  v_explanation:=coalesce(p_event->'explanation','{}'::jsonb)||jsonb_build_object(
    'observations',greatest(v_observations,coalesce((p_event#>>'{explanation,observations}')::integer,0)),
    'yearsObserved',v_years,
    'obligationEvidence',jsonb_strip_nulls(jsonb_build_object(
      'identitySource',v_identity_source,
      'seasonalObservations',v_observations,
      'seasonalYearsObserved',v_years,
      'observedOccurrencesPerYear',case when v_identity_source='bank_mandate' then v_occurrences_per_year else null end,
      'seasonalWindowDays',35,
      'rawMandateExposed',false
    ))
  );

  return jsonb_set(
    jsonb_set(p_event,'{explanation}',v_explanation,true),
    '{confidence}',to_jsonb(greatest(v_existing_conf,v_evidence_conf)),true
  );
end;
$function$;

create or replace function financial_app.forecast_rematch_annual_obligation_event(p_event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'financial_app', 'auth'
as $function$
declare
  v_source_text text;
  v_source_id uuid;
  v_account_id uuid;
  v_original_concept text;
  v_fallback text;
  v_fingerprint text;
  v_estimated_date date;
  v_estimated_amount numeric;
  v_tolerance integer;
  v_transaction_id uuid;
  v_actual_date date;
  v_actual_amount numeric;
  v_actual_title text;
  v_actual_category text;
begin
  if financial_app.authorized_email() is null then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if coalesce(p_event->>'source','automatic')<>'automatic' then return p_event; end if;
  if coalesce(p_event->>'status','')='received' then return p_event; end if;
  if not financial_app.forecast_is_annual_signal(p_event->>'category',p_event->>'subcategory',p_event->>'title')
     and coalesce(p_event#>>'{explanation,source}','') not in ('previous_year_seasonal','annual_tax_insurance_history') then
    return p_event;
  end if;

  v_source_text:=substring(coalesce(p_event->>'id','') from '^seasonal:([0-9a-fA-F-]{36}):');
  if v_source_text is null then
    v_source_text:=substring(coalesce(p_event->>'id','') from '^annual-history:([0-9a-fA-F-]{36}):');
  end if;
  if v_source_text is null then return p_event; end if;

  begin
    v_source_id:=v_source_text::uuid;
    v_estimated_date:=(p_event->>'estimatedDate')::date;
    v_estimated_amount:=(p_event->>'estimatedAmount')::numeric;
    v_tolerance:=greatest(0,coalesce((p_event->>'toleranceDays')::integer,35));
  exception when invalid_text_representation then
    return p_event;
  end;

  select
    t.account_id,
    coalesce(t.source_original_concept,''),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
  into v_account_id,v_original_concept,v_fallback
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where t.id=v_source_id
    and a.account_role='operating'
    and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false;

  if not found then return p_event; end if;
  v_fingerprint:=financial_app.forecast_obligation_fingerprint(v_original_concept,v_fallback);
  -- Fallback merchant identity can represent multiple policies. Only a bank mandate
  -- is strong enough to upgrade an automatic received match here.
  if v_fingerprint not like 'bank_mandate:%' then return p_event; end if;

  select
    t.id,
    coalesce(t.effective_date,t.source_date)::date,
    coalesce(t.personal_amount_override,t.source_amount)::numeric,
    coalesce(nullif(t.description_override,''),nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')),
    coalesce(t.category_override,t.source_category)
  into v_transaction_id,v_actual_date,v_actual_amount,v_actual_title,v_actual_category
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where a.account_role='operating'
    and t.account_id=v_account_id
    and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
    and coalesce(t.effective_date,t.source_date)<=current_date
    and coalesce(t.effective_date,t.source_date)::date between v_estimated_date-v_tolerance and v_estimated_date+v_tolerance
    and sign(coalesce(t.personal_amount_override,t.source_amount))=sign(v_estimated_amount)
    and abs(coalesce(t.personal_amount_override,t.source_amount)-v_estimated_amount)<=greatest(5::numeric,abs(v_estimated_amount)*.35)
    and financial_app.forecast_obligation_fingerprint(
      coalesce(t.source_original_concept,''),
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
    )=v_fingerprint
  order by
    abs(coalesce(t.effective_date,t.source_date)::date-v_estimated_date),
    abs(coalesce(t.personal_amount_override,t.source_amount)-v_estimated_amount),
    t.id
  limit 1;

  if v_transaction_id is null then return p_event; end if;
  return jsonb_set(
    jsonb_set(
      jsonb_set(p_event,'{status}',to_jsonb('received'::text),true),
      '{actual}',jsonb_build_object(
        'transactionId',v_transaction_id,
        'date',v_actual_date,
        'amount',round(v_actual_amount,2),
        'title',v_actual_title,
        'category',v_actual_category
      ),true
    ),
    '{match}',jsonb_build_object(
      'method','automatic_obligation_identity',
      'identityRank',0,
      'identitySource','bank_mandate',
      'dateDifferenceDays',abs(v_actual_date-v_estimated_date),
      'amountDifference',round(abs(v_actual_amount-v_estimated_amount),2)
    ),true
  );
end;
$function$;

-- Keep raw fingerprint and annual-memory helpers internal to owner/definer paths.
revoke execute on function financial_app.forecast_obligation_fingerprint(text,text) from authenticated;
revoke execute on function financial_app.forecast_annual_memory_candidate(uuid,date,date) from authenticated;
revoke all on function financial_app.forecast_enrich_annual_obligation_evidence(jsonb) from public, anon;
revoke all on function financial_app.forecast_rematch_annual_obligation_event(jsonb) from public, anon;
grant execute on function financial_app.forecast_enrich_annual_obligation_evidence(jsonb) to authenticated, service_role;
grant execute on function financial_app.forecast_rematch_annual_obligation_event(jsonb) to authenticated, service_role;