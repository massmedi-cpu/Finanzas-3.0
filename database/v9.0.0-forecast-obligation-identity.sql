-- Financial App 9.0.0 · obligation identity for taxes and insurance
-- Use bank mandate references only inside the database, never raw in forecast payloads.

create or replace function financial_app.forecast_obligation_fingerprint(
  p_original_concept text,
  p_fallback text
)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'financial_app'
as $function$
with identity as (
  select
    upper(substring(coalesce(p_original_concept,'') from '(?i)REF\.?\s+MANDATO\s+([A-Z0-9]+)')) as mandate_token,
    financial_app.forecast_norm(p_fallback) as fallback_norm
)
select case
  when coalesce(mandate_token,'')<>'' then
    'bank_mandate:'||md5('financial-app-v900-obligation:'||mandate_token)
  when coalesce(fallback_norm,'')<>'' then
    'normalized:'||md5('financial-app-v900-obligation:'||fallback_norm)
  else ''
end
from identity;
$function$;

create or replace function financial_app.forecast_annual_memory_candidate(
  p_transaction_id uuid,
  p_start date,
  p_end date
)
returns table(
  target_date date,
  estimated_amount numeric,
  observations integer,
  years_observed integer,
  missed_years integer,
  confidence numeric
)
language plpgsql
stable
set search_path to 'pg_catalog', 'financial_app'
as $function$
declare
  v_account_id uuid;
  v_anchor_date date;
  v_anchor_amount numeric;
  v_category text;
  v_subcategory text;
  v_title text;
  v_original_concept text;
  v_obligation_fingerprint text;
  v_latest_date date;
  v_median_amount numeric;
  v_observations integer:=0;
  v_years_observed integer:=0;
  v_age_days integer:=0;
  v_strong_signal boolean:=false;
  v_target date;
  v_year integer;
  v_month integer;
  v_day integer;
  v_last_day integer;
begin
  if p_transaction_id is null or p_start is null or p_end is null or p_end<p_start then return; end if;

  select
    t.account_id,
    coalesce(t.effective_date,t.source_date)::date,
    coalesce(t.personal_amount_override,t.source_amount)::numeric,
    coalesce(t.category_override,t.source_category),
    coalesce(t.subcategory_override,t.source_subcategory),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')),
    coalesce(t.source_original_concept,'')
  into v_account_id,v_anchor_date,v_anchor_amount,v_category,v_subcategory,v_title,v_original_concept
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where t.id=p_transaction_id
    and a.account_role='operating'
    and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
    and coalesce(t.personal_amount_override,t.source_amount)<=-5
    and coalesce(t.effective_date,t.source_date)<=current_date
    and financial_app.forecast_is_annual_signal(
      coalesce(t.category_override,t.source_category),
      coalesce(t.subcategory_override,t.source_subcategory),
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
    );

  if not found then return; end if;

  v_obligation_fingerprint:=financial_app.forecast_obligation_fingerprint(v_original_concept,v_title);
  if coalesce(v_obligation_fingerprint,'')='' then return; end if;

  v_strong_signal:=
    lower(coalesce(v_category,'')||' '||coalesce(v_subcategory,'')) ~ '(seguros|seguro)'
    or lower(coalesce(v_title,'')) ~ '(seguro|línea directa|linea directa|domiciliacion impuesto|domiciliación impuesto|impuesto|irpf|\mibi\M|\mivtm\M|tributo|tasa municipal)';

  with memory_rows as(
    select
      coalesce(t.effective_date,t.source_date)::date d,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.account_id=v_account_id
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.personal_amount_override,t.source_amount)<=-5
      and coalesce(t.effective_date,t.source_date) between p_start-2190 and current_date
      and financial_app.forecast_obligation_fingerprint(
        coalesce(t.source_original_concept,''),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )=v_obligation_fingerprint
      and financial_app.forecast_is_annual_signal(
        coalesce(t.category_override,t.source_category),
        coalesce(t.subcategory_override,t.source_subcategory),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )
      -- An obligation can have more than one seasonal occurrence per year.
      -- Keep each slot separate instead of collapsing the whole mandate.
      and least(
        abs(extract(doy from coalesce(t.effective_date,t.source_date))-extract(doy from v_anchor_date)),
        366-abs(extract(doy from coalesce(t.effective_date,t.source_date))-extract(doy from v_anchor_date))
      )<=35
      and abs(abs(coalesce(t.personal_amount_override,t.source_amount))-abs(v_anchor_amount))
        <=greatest(2::numeric,greatest(abs(coalesce(t.personal_amount_override,t.source_amount)),abs(v_anchor_amount))*.12)
  )
  select
    count(*)::int,
    count(distinct extract(year from d))::int,
    max(d),
    percentile_cont(.5) within group(order by amount)::numeric
  into v_observations,v_years_observed,v_latest_date,v_median_amount
  from memory_rows;

  if v_latest_date is null or v_anchor_date<v_latest_date then return; end if;
  if v_years_observed<2 and not v_strong_signal then return; end if;

  v_age_days:=greatest(0,p_start-v_anchor_date);
  if v_age_days<=550 then
    null;
  elsif v_age_days<=950 then
    if v_years_observed<2 then return; end if;
  elsif v_age_days<=1300 then
    if v_years_observed<3 then return; end if;
  else
    return;
  end if;

  v_year:=extract(year from p_start)::int;
  v_month:=extract(month from v_anchor_date)::int;
  v_day:=extract(day from v_anchor_date)::int;
  v_last_day:=extract(day from (date_trunc('month',make_date(v_year,v_month,1))+interval '1 month - 1 day')::date)::int;
  v_target:=make_date(v_year,v_month,least(v_day,v_last_day));
  if v_target<p_start then
    v_year:=v_year+1;
    v_last_day:=extract(day from (date_trunc('month',make_date(v_year,v_month,1))+interval '1 month - 1 day')::date)::int;
    v_target:=make_date(v_year,v_month,least(v_day,v_last_day));
  end if;
  if v_target>p_end then return; end if;

  missed_years:=greatest(0,floor(v_age_days/365.25)::int-1);
  observations:=v_observations;
  years_observed:=v_years_observed;
  estimated_amount:=round(coalesce(v_median_amount,v_anchor_amount),2);
  confidence:=greatest(.52::numeric,least(.88::numeric,
    (case
      when v_years_observed>=4 then .86
      when v_years_observed=3 then .82
      when v_years_observed=2 then .76
      else .68
    end)::numeric-(missed_years*.08)::numeric
  ));
  target_date:=v_target;
  return next;
end;
$function$;

create or replace function financial_app.forecast_enrich_annual_obligation_evidence(p_event jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog', 'financial_app'
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
set search_path to 'pg_catalog', 'financial_app'
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

create or replace function financial_app.forecast_calendar_precision_core(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog', 'financial_app'
as $function$
declare
  v_payload jsonb;
  v_events jsonb;
  v_counts jsonb;
  v_rules jsonb;
  v_projection_months jsonb;
  v_start date;
  v_end date;
begin
  v_payload := financial_app.forecast_calendar_document_commitments_core(p_start,p_months);
  v_start := (v_payload->>'startDate')::date;
  v_end := (v_payload->>'endDate')::date;

  with prepared as (
    select e.item,e.ord,
      case
        when financial_app.forecast_match_is_trustworthy(e.item) then e.item
        else jsonb_set(
          jsonb_set(
            jsonb_set(
              e.item,
              '{status}',
              to_jsonb(case
                when (e.item->>'estimatedDate')::date < current_date-greatest(0,coalesce((e.item->>'toleranceDays')::integer,0))
                  then 'late'::text
                else 'expected'::text
              end),
              true
            ),
            '{actual}','null'::jsonb,true
          ),
          '{match}','null'::jsonb,true
        )
      end trusted_item
    from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) with ordinality as e(item,ord)
  ), filtered as (
    select p.ord,p.trusted_item
    from prepared p
    where financial_app.forecast_auto_event_is_reliable(p.trusted_item)
  ), obligation_aware as (
    select f.ord,
      financial_app.forecast_rematch_annual_obligation_event(
        financial_app.forecast_enrich_annual_obligation_evidence(f.trusted_item)
      ) item
    from filtered f
  )
  select coalesce(jsonb_agg(o.item order by o.ord),'[]'::jsonb)
    into v_events
  from obligation_aware o;

  select jsonb_build_object(
    'total', count(*),
    'expected', count(*) filter (where item->>'status'='expected'),
    'received', count(*) filter (where item->>'status'='received'),
    'late', count(*) filter (where item->>'status' in ('late','overdue')),
    'dismissed', coalesce((v_payload#>>'{counts,dismissed}')::integer,0)
  )
    into v_counts
  from jsonb_array_elements(v_events) as e(item);

  with months as (
    select generate_series(date_trunc('month',v_start),date_trunc('month',v_end),interval '1 month')::date month_start
  ), actual as (
    select to_date(a.item->>'month','YYYY-MM') month_start,
      coalesce((a.item->>'income')::numeric,0) income,
      coalesce((a.item->>'expenses')::numeric,0) expenses,
      coalesce((a.item->>'cashFlow')::numeric,0) cash_flow,
      coalesce((a.item->>'movements')::integer,0) movements
    from jsonb_array_elements(coalesce(v_payload->'actualMonths','[]'::jsonb)) a(item)
  ), event_rows as (
    select (e.item->>'estimatedDate')::date estimated_date,
      (e.item->>'estimatedAmount')::numeric estimated_amount,
      e.item->>'status' status
    from jsonb_array_elements(v_events) e(item)
  ), pending as (
    select date_trunc('month',estimated_date)::date month_start,
      coalesce(sum(estimated_amount) filter(where estimated_amount>0 and status<>'received'),0)::numeric income,
      coalesce(abs(sum(estimated_amount) filter(where estimated_amount<0 and status<>'received')),0)::numeric expenses,
      coalesce(sum(estimated_amount) filter(where status<>'received'),0)::numeric cash_flow,
      count(*) filter(where status<>'received')::integer events
    from event_rows
    group by date_trunc('month',estimated_date)::date
  ), received as (
    select date_trunc('month',estimated_date)::date month_start,count(*)::integer events
    from event_rows
    where status='received'
    group by date_trunc('month',estimated_date)::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(m.month_start,'YYYY-MM'),
    'actualIncome',round(coalesce(a.income,0),2),
    'actualExpenses',round(coalesce(a.expenses,0),2),
    'actualCashFlow',round(coalesce(a.cash_flow,0),2),
    'pendingIncome',round(coalesce(p.income,0),2),
    'pendingExpenses',round(coalesce(p.expenses,0),2),
    'pendingCashFlow',round(coalesce(p.cash_flow,0),2),
    'projectedIncome',round(coalesce(a.income,0)+coalesce(p.income,0),2),
    'projectedExpenses',round(coalesce(a.expenses,0)+coalesce(p.expenses,0),2),
    'projectedCashFlow',round(coalesce(a.cash_flow,0)+coalesce(p.cash_flow,0),2),
    'actualMovements',coalesce(a.movements,0),
    'pendingEvents',coalesce(p.events,0),
    'receivedEvents',coalesce(r.events,0)
  ) order by m.month_start),'[]'::jsonb)
    into v_projection_months
  from months m
  left join actual a using(month_start)
  left join pending p using(month_start)
  left join received r using(month_start);

  v_rules := coalesce(v_payload->'rules','{}'::jsonb) || jsonb_build_object(
    'automaticPrecision', jsonb_build_object(
      'enabled', true,
      'precisionOverRecall', true,
      'positiveIncomeRequiresStableType', true,
      'annualRequiresTaxOrInsurance', true,
      'transfersExcluded', true,
      'recurringExpensesRequireObligationMetadata', true,
      'receivedRequiresStrongIdentity', true,
      'projectionRecomputedAfterPrecision', true,
      'bankMandateObligationIdentity', true,
      'rawBankMandateExposed', false,
      'seasonalSlotsPreserved', true,
      'annualEvidenceEnriched', true
    )
  );

  return v_payload || jsonb_build_object(
    'events', v_events,
    'counts', v_counts,
    'projectionMonths', v_projection_months,
    'rules', v_rules
  );
end;
$function$;

revoke all on function financial_app.forecast_obligation_fingerprint(text,text) from public, anon;
revoke all on function financial_app.forecast_enrich_annual_obligation_evidence(jsonb) from public, anon;
revoke all on function financial_app.forecast_rematch_annual_obligation_event(jsonb) from public, anon;
revoke all on function financial_app.forecast_annual_memory_candidate(uuid,date,date) from public, anon;
revoke all on function financial_app.forecast_calendar_precision_core(date,integer) from public, anon;

grant execute on function financial_app.forecast_obligation_fingerprint(text,text) to authenticated, service_role;
grant execute on function financial_app.forecast_enrich_annual_obligation_evidence(jsonb) to authenticated, service_role;
grant execute on function financial_app.forecast_rematch_annual_obligation_event(jsonb) to authenticated, service_role;
grant execute on function financial_app.forecast_annual_memory_candidate(uuid,date,date) to authenticated, service_role;
grant execute on function financial_app.forecast_calendar_precision_core(date,integer) to authenticated, service_role;