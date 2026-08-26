-- Financial App 3.6.0 — calendar-first forecast.
-- Expected movements are estimates. Only a real bank transaction confirms an event.
-- Annual insurance/tax patterns receive a dedicated seasonal fallback.

create or replace function financial_app.forecast_calendar_core(
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
  v_start date;
  v_end date;
  v_months integer;
  v_result jsonb;
begin
  if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_months:=greatest(1,least(coalesce(p_months,12),18));
  v_start:=date_trunc('month',coalesce(p_start,current_date))::date;
  v_end:=(v_start+make_interval(months=>v_months)-interval '1 day')::date;

  with raw_base as(
    select t.id transaction_id,t.source_id,t.account_id,
      lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')))) key_norm,
      coalesce(nullif(t.description_override,''),nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) label,
      coalesce(t.effective_date,t.source_date) d,coalesce(t.personal_amount_override,t.source_amount) amount,
      coalesce(t.category_override,t.source_category) category,coalesce(t.subcategory_override,t.source_subcategory) subcategory,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,'')) counterparty,
      sign(coalesce(t.personal_amount_override,t.source_amount)) amount_sign
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating' and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and abs(coalesce(t.personal_amount_override,t.source_amount))>=1
      and coalesce(t.effective_date,t.source_date)>=v_start-1460 and coalesce(t.effective_date,t.source_date)<=current_date
      and coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) is not null
  ),daily as(
    select key_norm,amount_sign,d,(array_agg(label order by abs(amount) desc))[1] label,
      (array_agg(category order by abs(amount) desc) filter(where category is not null))[1] category,
      (array_agg(subcategory order by abs(amount) desc) filter(where subcategory is not null))[1] subcategory,
      (array_agg(counterparty order by abs(amount) desc) filter(where counterparty is not null))[1] counterparty,
      percentile_cont(.5) within group(order by abs(amount)) day_abs_amount
    from raw_base group by key_norm,amount_sign,d
  ),sequenced as(
    select d.*,d.d-lag(d.d) over(partition by key_norm,amount_sign order by d.d) gap_days from daily d
  ),stats as(
    select key_norm,amount_sign,count(*) n,min(d) first_date,max(d) last_date,
      (array_agg(label order by d desc))[1] label,
      (array_agg(category order by d desc) filter(where category is not null))[1] category,
      (array_agg(subcategory order by d desc) filter(where subcategory is not null))[1] subcategory,
      (array_agg(counterparty order by d desc) filter(where counterparty is not null))[1] counterparty,
      percentile_cont(.5) within group(order by day_abs_amount) median_abs,
      coalesce(stddev_pop(day_abs_amount)/nullif(avg(day_abs_amount),0),0) amount_cv,
      percentile_cont(.5) within group(order by gap_days) filter(where gap_days is not null) median_gap,
      coalesce(stddev_pop(gap_days) filter(where gap_days is not null),0) interval_sd,
      percentile_cont(.5) within group(order by extract(day from d)) median_day,
      coalesce(stddev_pop(extract(day from d)),0) day_sd,
      bool_or(lower(coalesce(category,''))~'(seguros|impuestos y tasas|vivienda|suministros|comunicaciones|suscripciones)' or lower(coalesce(subcategory,''))~'(seguro|impuesto|tasa|ibi|ivtm|comunidad|telefon|internet|electricidad|agua|financiaci|suscrip|nómina|nomina)') recurring_signal,
      bool_or(lower(coalesce(category,''))~'^(seguros|impuestos y tasas)' or lower(coalesce(subcategory,''))~'(seguro|impuesto|tasa|ibi|ivtm|tribut)') seasonal_signal
    from sequenced group by key_norm,amount_sign having count(*)>=2
  ),classified as(
    select s.*,case
      when median_gap between 23 and 42 and last_date>=current_date-90 and ((recurring_signal and amount_cv<=1.50 and interval_sd<=75) or (n>=3 and amount_cv<=.75 and interval_sd<=40)) then 1
      when median_gap between 43 and 78 and last_date>=current_date-150 and ((recurring_signal and amount_cv<=1.50 and interval_sd<=75) or (n>=3 and amount_cv<=.75 and interval_sd<=45)) then 2
      when median_gap between 79 and 120 and last_date>=current_date-220 and ((recurring_signal and amount_cv<=1.50 and interval_sd<=75) or (n>=3 and amount_cv<=.85 and interval_sd<=55)) then 3
      when median_gap between 300 and 430 and last_date>=current_date-500 and ((recurring_signal and amount_cv<=1.50 and interval_sd<=90) or (n>=2 and amount_cv<=.90 and interval_sd<=75)) then 12 end interval_months
    from stats s
  ),regular_patterns as(
    select c.*,least(.97,greatest(.55,.50+least(c.n,10)*.035+(1-least(c.amount_cv,1))*.10+(case when c.recurring_signal then .08 else 0 end)+(case when c.interval_months=12 then .04 else .07 end)-(least(coalesce(c.interval_sd,0),90)/90)*.05)) confidence,
      md5(c.key_norm||':'||c.amount_sign||':'||c.interval_months) pattern_id
    from classified c where c.interval_months is not null
      and not exists(select 1 from financial_app.forecasts f where f.status<>'cancelled'::financial_app.forecast_status and(lower(coalesce(f.counterparty,''))=c.key_norm or lower(f.title)=c.key_norm))
  ),regular_targets as(
    select p.*,g.step,(p.last_date+make_interval(months=>p.interval_months*g.step))::date raw_target from regular_patterns p cross join generate_series(-24,48) g(step)
  ),regular_occurrences as(
    select 'automatic:'||pattern_id||':'||next_date::text id,pattern_id,label as title,next_date estimated_date,round((median_abs*amount_sign)::numeric,2) estimated_amount,
      category,subcategory,counterparty,key_norm,'automatic'::text source,
      case interval_months when 1 then 'monthly' when 2 then 'bimonthly' when 3 then 'quarterly' else 'yearly' end frequency,
      round(confidence::numeric,2) confidence,greatest(5,least(30,ceil(coalesce(day_sd,0)*2)::int)) tolerance_days,
      case when seasonal_signal then .65::numeric else .35::numeric end amount_tolerance,n observations,
      jsonb_build_object('source','recurring_history','observations',n,'medianIntervalDays',case when median_gap is null then null else round(median_gap::numeric,1) end,'dateVariationDays',round(coalesce(day_sd,0)::numeric,1),'reason',case when seasonal_signal then 'Patrón recurrente de seguro o impuesto' else 'Patrón recurrente del historial' end) explanation,
      null::uuid forecast_id
    from(select t.*,make_date(extract(year from raw_target)::int,extract(month from raw_target)::int,least(greatest(1,round(median_day)::int),extract(day from(date_trunc('month',raw_target)+interval '1 month - 1 day'))::int)) next_date from regular_targets t)q
    where next_date between v_start and v_end
  ),seasonal_occurrences as(
    select 'seasonal:'||r.transaction_id::text||':'||(r.d+interval '1 year')::date::text id,md5('seasonal:'||coalesce(r.key_norm,'')||':'||r.transaction_id::text) pattern_id,
      r.label title,(r.d+interval '1 year')::date estimated_date,round(r.amount::numeric,2) estimated_amount,r.category,r.subcategory,r.counterparty,r.key_norm,'automatic'::text source,'yearly'::text frequency,.70::numeric confidence,30 tolerance_days,.75::numeric amount_tolerance,1 observations,
      jsonb_build_object('source','previous_year_seasonal','observations',1,'dateVariationDays',30,'reason','Seguro o impuesto observado el año anterior') explanation,null::uuid forecast_id
    from raw_base r where r.amount<0 and(lower(coalesce(r.category,''))~'^(seguros|impuestos y tasas)' or lower(coalesce(r.subcategory,''))~'(seguro|impuesto|tasa|ibi|ivtm|tribut)')
      and(r.d+interval '1 year')::date between v_start and v_end
      and not exists(select 1 from regular_occurrences ro where ro.key_norm=r.key_norm and abs(ro.estimated_date-(r.d+interval '1 year')::date)<=35)
  ),manual_occurrences as(
    select 'manual:'||f.id::text||':'||x.d::text id,md5('manual:'||f.id::text) pattern_id,f.title,x.d estimated_date,round(f.predicted_amount::numeric,2) estimated_amount,
      f.category,f.subcategory,f.counterparty,lower(trim(coalesce(nullif(f.counterparty,''),nullif(f.title,'')))) key_norm,'manual'::text source,
      case when f.recurrence_rule is null then 'once' when coalesce(f.recurrence_rule->>'frequency','monthly')='yearly' then 'yearly' when coalesce(f.recurrence_rule->>'frequency','monthly')='weekly' then 'weekly' when greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))=2 then 'bimonthly' when greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))=3 then 'quarterly' else 'monthly' end frequency,
      coalesce(f.confidence,1)::numeric confidence,7 tolerance_days,.20::numeric amount_tolerance,1 observations,coalesce(f.explanation,'{}'::jsonb)||jsonb_build_object('source','manual') explanation,f.id forecast_id
    from financial_app.forecasts f cross join lateral(
      select f.predicted_date::date d where f.recurrence_rule is null
      union all
      select case coalesce(f.recurrence_rule->>'frequency','monthly') when 'weekly' then(f.predicted_date+make_interval(weeks=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date when 'yearly' then(f.predicted_date+make_interval(years=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date else(f.predicted_date+make_interval(months=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date end from generate_series(0,120)n where f.recurrence_rule is not null
    )x where f.status<>'cancelled'::financial_app.forecast_status and x.d between v_start and v_end and x.d<=coalesce(nullif(f.recurrence_rule->>'until','')::date,v_end)
  ),predictions as(
    select * from regular_occurrences union all select * from seasonal_occurrences union all select * from manual_occurrences
  ),resolved as(
    select p.*,m.transaction_id actual_transaction_id,m.actual_date,m.actual_amount,m.actual_title,m.actual_category,
      case when m.transaction_id is not null then 'received' when p.estimated_date<current_date-p.tolerance_days then 'late' else 'expected' end status
    from predictions p left join lateral(
      select t.id transaction_id,coalesce(t.effective_date,t.source_date) actual_date,coalesce(t.personal_amount_override,t.source_amount) actual_amount,
        coalesce(nullif(t.description_override,''),nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) actual_title,
        coalesce(t.category_override,t.source_category) actual_category
      from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
      where a.account_role='operating' and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
        and coalesce(t.effective_date,t.source_date) between p.estimated_date-p.tolerance_days and p.estimated_date+p.tolerance_days and coalesce(t.effective_date,t.source_date)<=current_date
        and sign(coalesce(t.personal_amount_override,t.source_amount))=sign(p.estimated_amount)
        and abs(coalesce(t.personal_amount_override,t.source_amount)-p.estimated_amount)<=greatest(3,abs(p.estimated_amount)*p.amount_tolerance)
        and((p.key_norm is not null and(lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))))=p.key_norm or lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')))) like '%'||p.key_norm||'%' or p.key_norm like '%'||lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))))||'%'))
          or((p.explanation->>'source')='previous_year_seasonal' and coalesce(t.category_override,t.source_category)=p.category and(p.subcategory is null or coalesce(t.subcategory_override,t.source_subcategory)=p.subcategory))
          or(p.source='manual' and p.counterparty is null and p.category is not null and coalesce(t.category_override,t.source_category)=p.category))
      order by case when lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))))=p.key_norm then 0 else 1 end,
        abs(coalesce(t.effective_date,t.source_date)-p.estimated_date),abs(coalesce(t.personal_amount_override,t.source_amount)-p.estimated_amount),t.source_id limit 1
    )m on true
  )
  select jsonb_build_object('version',financial_app.current_app_version(),'startDate',v_start,'endDate',v_end,'months',v_months,
    'events',coalesce(jsonb_agg(jsonb_build_object('id',id,'patternId',pattern_id,'forecastId',forecast_id,'title',title,'estimatedDate',estimated_date,'estimatedAmount',estimated_amount,'category',category,'subcategory',subcategory,'counterparty',counterparty,'source',source,'frequency',frequency,'confidence',confidence,'status',status,'toleranceDays',tolerance_days,'explanation',explanation,'actual',case when actual_transaction_id is null then null else jsonb_build_object('transactionId',actual_transaction_id,'date',actual_date,'amount',actual_amount,'title',actual_title,'category',actual_category) end) order by estimated_date,case status when 'late' then 0 when 'expected' then 1 else 2 end,abs(estimated_amount) desc),'[]'::jsonb),
    'counts',jsonb_build_object('total',count(*),'expected',count(*)filter(where status='expected'),'received',count(*)filter(where status='received'),'late',count(*)filter(where status='late')),
    'rules',jsonb_build_object('calendarOnly',true,'estimatedDates',true,'actualMovementConfirms',true,'annualInsuranceAndTaxPatterns',true,'historyWindowDays',1460,'maximumMonths',18)) into v_result from resolved;
  return v_result;
end;$function$;

revoke all on function financial_app.forecast_calendar_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_calendar_core(date,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_calendar(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app'
as $function$
  select financial_app.forecast_calendar_core(p_start,p_months)
$function$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role;
