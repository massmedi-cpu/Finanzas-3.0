-- Financial App 3.7.2 — forecast reconciliation and actual-month projection.
-- Keeps the existing authorization boundary and enriches the read-only forecast result.

create or replace function financial_app.forecast_calendar_visible_core(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_payload jsonb;
  v_events jsonb;
  v_actual_months jsonb;
  v_start date;
  v_end date;
  v_total integer:=0;
  v_expected integer:=0;
  v_received integer:=0;
  v_late integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_payload:=financial_app.forecast_calendar_core(p_start,p_months);
  v_start:=(v_payload->>'startDate')::date;
  v_end:=(v_payload->>'endDate')::date;

  with visible as(
    select x.item,x.ord
    from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) with ordinality x(item,ord)
    where not exists(
      select 1 from financial_app.forecast_event_overrides o
      where o.user_email=v_email and o.event_id=x.item->>'id' and o.action='dismissed'
    )
  ), candidates as(
    select v.ord,v.item,t.id transaction_id,t.source_id,
      coalesce(t.effective_date,t.source_date) actual_date,
      coalesce(t.personal_amount_override,t.source_amount) actual_amount,
      coalesce(nullif(t.description_override,''),nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) actual_title,
      coalesce(t.category_override,t.source_category) actual_category,
      abs(coalesce(t.effective_date,t.source_date)-(v.item->>'estimatedDate')::date) date_distance,
      abs(coalesce(t.personal_amount_override,t.source_amount)-(v.item->>'estimatedAmount')::numeric) amount_distance
    from visible v
    join financial_app.transactions t on true
    join financial_app.accounts a on a.id=t.account_id
    where v.item->>'status'<>'received'
      and a.account_role='operating'
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date)<=current_date
      and coalesce(t.effective_date,t.source_date) between
        (v.item->>'estimatedDate')::date-greatest(0,coalesce((v.item->>'toleranceDays')::int,0))
        and (v.item->>'estimatedDate')::date+greatest(0,coalesce((v.item->>'toleranceDays')::int,0))
      and sign(coalesce(t.personal_amount_override,t.source_amount))=sign((v.item->>'estimatedAmount')::numeric)
      and abs(coalesce(t.personal_amount_override,t.source_amount)-(v.item->>'estimatedAmount')::numeric)<=greatest(2::numeric,abs((v.item->>'estimatedAmount')::numeric)*.05)
      and trim(regexp_replace(regexp_replace(lower(coalesce(t.category_override,t.source_category,'')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))<>''
      and trim(regexp_replace(regexp_replace(lower(coalesce(v.item->>'category','')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))=trim(regexp_replace(regexp_replace(lower(coalesce(t.category_override,t.source_category,'')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))
      and trim(regexp_replace(regexp_replace(lower(coalesce(t.subcategory_override,t.source_subcategory,'')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))<>''
      and trim(regexp_replace(regexp_replace(lower(coalesce(v.item->>'subcategory','')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))=trim(regexp_replace(regexp_replace(lower(coalesce(t.subcategory_override,t.source_subcategory,'')),'[^[:alnum:]]+',' ','g'),'[[:space:]]+',' ','g'))
      and not exists(
        select 1 from visible already
        where already.item->>'status'='received' and already.item->'actual'->>'transactionId'=t.id::text
      )
  ), event_ranked as(
    select c.*,row_number() over(partition by c.ord order by c.date_distance,c.amount_distance,c.source_id) event_rank
    from candidates c
  ), best_per_event as(
    select * from event_ranked where event_rank=1
  ), transaction_ranked as(
    select b.*,row_number() over(partition by b.transaction_id order by b.date_distance,b.amount_distance,b.ord) transaction_rank
    from best_per_event b
  ), matches as(
    select * from transaction_ranked where transaction_rank=1
  ), enriched as(
    select v.ord,
      case when m.transaction_id is null then v.item else
        jsonb_set(
          jsonb_set(v.item,'{status}',to_jsonb('received'::text),true),
          '{actual}',jsonb_build_object(
            'transactionId',m.transaction_id,'date',m.actual_date,'amount',round(m.actual_amount::numeric,2),
            'title',m.actual_title,'category',m.actual_category
          ),true
        )
      end item
    from visible v left join matches m on m.ord=v.ord
  )
  select coalesce(jsonb_agg(e.item order by e.ord),'[]'::jsonb) into v_events from enriched e;

  with months as(
    select generate_series(date_trunc('month',v_start),date_trunc('month',v_end),interval '1 month')::date month_start
  ), eligible as(
    select date_trunc('month',coalesce(t.effective_date,t.source_date))::date month_start,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating' and a.cash_flow_enabled=true
      and t.cash_flow_override is distinct from false
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date) between v_start and least(v_end,current_date)
  ), actual as(
    select month_start,
      coalesce(sum(amount) filter(where amount>0),0)::numeric income,
      coalesce(abs(sum(amount) filter(where amount<0)),0)::numeric expenses,
      coalesce(sum(amount),0)::numeric cash_flow,count(*)::int movements
    from eligible group by month_start
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(m.month_start,'YYYY-MM'),'income',round(coalesce(a.income,0),2),
    'expenses',round(coalesce(a.expenses,0),2),'cashFlow',round(coalesce(a.cash_flow,0),2),
    'movements',coalesce(a.movements,0)
  ) order by m.month_start),'[]'::jsonb)
  into v_actual_months
  from months m left join actual a using(month_start);

  select count(*)::int,
    count(*) filter(where e.item->>'status'='expected')::int,
    count(*) filter(where e.item->>'status'='received')::int,
    count(*) filter(where e.item->>'status'='late')::int
  into v_total,v_expected,v_received,v_late
  from jsonb_array_elements(coalesce(v_events,'[]'::jsonb)) e(item);

  return v_payload || jsonb_build_object(
    'events',coalesce(v_events,'[]'::jsonb),'actualMonths',coalesce(v_actual_months,'[]'::jsonb),
    'counts',jsonb_build_object('total',v_total,'expected',v_expected,'received',v_received,'late',v_late),
    'rules',coalesce(v_payload->'rules','{}'::jsonb)||jsonb_build_object(
      'dismissibleOccurrences',true,'dismissedEventsExcludedFromMetrics',true,
      'normalizedCategoryFallbackMatching',true,'actualExpensesIncludedInProjection',true,
      'confirmedEventsNotDoubleCounted',true
    )
  );
end;$function$;

revoke all on function financial_app.forecast_calendar_visible_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_calendar_visible_core(date,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_calendar(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','financial_app'
as $function$
  select financial_app.forecast_calendar_visible_core(p_start,p_months)
$function$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role;
