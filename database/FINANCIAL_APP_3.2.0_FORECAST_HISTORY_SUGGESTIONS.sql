create or replace function financial_app.forecast_overview_core(p_start date default current_date,p_days integer default 90)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_end date;v_balance numeric:=0;v_savings numeric:=0;v_suggestions jsonb:='[]'::jsonb;v_events jsonb:='[]'::jsonb;v_saved jsonb:='[]'::jsonb;
  v_income numeric:=0;v_expenses numeric:=0;v_net numeric:=0;v_projected numeric:=0;v_lowest numeric:=0;v_series jsonb:='[]'::jsonb;v_monthly jsonb:='[]'::jsonb;v_consolidated int:=0;
begin
  if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501';end if;
  if p_start is null then p_start:=current_date;end if;p_days:=greatest(30,least(coalesce(p_days,90),365));v_end:=p_start+p_days;
  select coalesce(b.source_balance,0) into v_balance from financial_app.accounts a left join lateral(select t.source_balance from financial_app.transactions t where t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1)b on true where a.active=true and a.account_role='operating' order by a.created_at limit 1;v_balance:=coalesce(v_balance,0);
  select coalesce(sum(b.source_balance),0) into v_savings from financial_app.accounts a left join lateral(select t.source_balance from financial_app.transactions t where t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1)b on true where a.active=true and a.account_role='savings';

  with raw_base as(
    select lower(trim(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')))) key_norm,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) label,
      coalesce(t.effective_date,t.source_date) d,
      coalesce(t.personal_amount_override,t.source_amount) amount,
      coalesce(t.category_override,t.source_category) category,
      coalesce(t.subcategory_override,t.source_subcategory) subcategory,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,'')) counterparty,
      sign(coalesce(t.personal_amount_override,t.source_amount)) amount_sign
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating' and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and abs(coalesce(t.personal_amount_override,t.source_amount))>=1
      and coalesce(t.effective_date,t.source_date)>=p_start-730 and coalesce(t.effective_date,t.source_date)<=p_start
      and coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) is not null
  ),daily as(
    select key_norm,amount_sign,d,(array_agg(label order by abs(amount) desc))[1] label,
      (array_agg(category order by abs(amount) desc) filter(where category is not null))[1] category,
      (array_agg(subcategory order by abs(amount) desc) filter(where subcategory is not null))[1] subcategory,
      (array_agg(counterparty order by abs(amount) desc) filter(where counterparty is not null))[1] counterparty,
      sum(amount) amount
    from raw_base group by key_norm,amount_sign,d
  ),seq as(
    select b.*,d-lag(d) over(partition by key_norm,amount_sign order by d) gap_days from daily b
  ),stats as(
    select key_norm,amount_sign,count(*) n,max(d) last_date,
      (array_agg(label order by d desc))[1] label,
      (array_agg(category order by d desc) filter(where category is not null))[1] category,
      (array_agg(subcategory order by d desc) filter(where subcategory is not null))[1] subcategory,
      (array_agg(counterparty order by d desc) filter(where counterparty is not null))[1] counterparty,
      percentile_cont(.5) within group(order by abs(amount)) median_abs,
      coalesce(stddev_pop(abs(amount))/nullif(avg(abs(amount)),0),0) amount_cv,
      percentile_cont(.5) within group(order by gap_days) filter(where gap_days is not null) median_gap,
      coalesce(stddev_pop(gap_days) filter(where gap_days is not null),0) interval_sd
    from seq group by key_norm,amount_sign having count(*)>=1
  ),classified as(
    select *,case
      when n>=3 and median_gap between 23 and 40 and last_date>=p_start-55 and amount_cv<=.75 and interval_sd<=22 then 1
      when n>=3 and median_gap between 45 and 75 and last_date>=p_start-95 and amount_cv<=.75 and interval_sd<=28 then 2
      when n>=3 and median_gap between 76 and 110 and last_date>=p_start-145 and amount_cv<=.75 and interval_sd<=35 then 3
      when n>=2 and median_gap between 330 and 400 and last_date>=p_start-420 and amount_cv<=.65 and interval_sd<=45 then 12
      when amount_sign>0 and n>=1 and last_date>=p_start-45 and lower(coalesce(category,'')) like 'ingresos laborales%' and median_abs>=400 then 1
    end interval_months,
    case when amount_sign>0 and n=1 and last_date>=p_start-45 and lower(coalesce(category,'')) like 'ingresos laborales%' and median_abs>=400 then 'Ingreso laboral reciente; posible repetición mensual'
         else 'Patrón recurrente detectado en tu historial' end reason
    from stats
  ),patterns as(
    select *,least(.97,greatest(.45,
      case when n=1 then .45 else .52 end
      +least(n,10)*.035
      +(1-least(amount_cv,1))*.10
      +(case when interval_months=12 then .05 else .08 end)
      -(least(coalesce(interval_sd,0),40)/40)*.05
    )) confidence
    from classified c
    where interval_months is not null
      and not exists(select 1 from financial_app.forecasts f where f.status<>'cancelled'::financial_app.forecast_status and(lower(coalesce(f.counterparty,''))=c.key_norm or lower(f.title)=c.key_norm))
  ),occurrences as(
    select p.*, (p.last_date+make_interval(months=>p.interval_months*g.step))::date next_date
    from patterns p cross join generate_series(1,24) g(step)
    where (p.last_date+make_interval(months=>p.interval_months*g.step))::date between p_start and v_end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',md5(key_norm||':'||amount_sign||':'||interval_months||':'||next_date),
    'title',label,'nextDate',next_date,'amount',round((median_abs*amount_sign)::numeric,2),
    'category',category,'subcategory',subcategory,'counterparty',counterparty,'confidence',round(confidence::numeric,2),
    'recurrence',jsonb_build_object('frequency',case when interval_months=12 then 'yearly' else 'monthly' end,'interval',case when interval_months=12 then 1 else interval_months end),
    'explanation',jsonb_build_object('observations',n,'medianIntervalDays',case when median_gap is null then null else round(median_gap::numeric,1) end,'amountVariation',round((amount_cv*100)::numeric,1),'intervalVariationDays',round(coalesce(interval_sd,0)::numeric,1),'source','historical_pattern_v2','reason',reason)
  ) order by next_date,confidence desc,abs(median_abs) desc),'[]'::jsonb) into v_suggestions from occurrences;

  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'date',f.predicted_date,'amount',f.predicted_amount,'category',f.category,'subcategory',f.subcategory,'counterparty',f.counterparty,'recurrence',f.recurrence_rule,'confidence',f.confidence,'notes',f.notes,'status',f.status) order by f.predicted_date,f.title),'[]'::jsonb) into v_saved from financial_app.forecasts f where f.status<>'cancelled'::financial_app.forecast_status;
  with stored as(
    select o.id::text id,o.occurrence_date event_date,o.predicted_amount amount,f.title,f.category,f.subcategory,f.counterparty,'saved'::text source,coalesce(f.confidence,1) confidence from financial_app.forecast_occurrences o join financial_app.forecasts f on f.id=o.forecast_id where o.status='pending' and o.occurrence_date between p_start and v_end and f.status<>'cancelled'::financial_app.forecast_status
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'date',event_date,'amount',amount,'title',title,'category',category,'subcategory',subcategory,'counterparty',counterparty,'source',source,'confidence',confidence) order by event_date,id),'[]'::jsonb),coalesce(sum(amount) filter(where amount>0),0),coalesce(abs(sum(amount) filter(where amount<0)),0),coalesce(sum(amount),0) into v_events,v_income,v_expenses,v_net from stored;
  v_projected:=v_balance+v_net;
  with e as(select * from jsonb_to_recordset(v_events) as x(id text,"date" date,amount numeric,title text,source text)),o as(select id,"date" event_date,amount,title,source,sum(amount) over(order by "date",id) cum from e),points as(select 0 seq,p_start point_date,v_balance balance,'Saldo actual' title,'current' source union all select row_number() over(order by event_date,id)::int,event_date,v_balance+cum,title,source from o)
  select coalesce(min(balance),v_balance),coalesce(jsonb_agg(jsonb_build_object('date',point_date,'balance',round(balance,2),'title',title,'source',source) order by seq),'[]'::jsonb) into v_lowest,v_series from points;
  with e as(select * from jsonb_to_recordset(v_events) as x("date" date,amount numeric)),m as(select to_char(date_trunc('month',"date"),'YYYY-MM') month_key,coalesce(sum(amount) filter(where amount>0),0) income,coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,coalesce(sum(amount),0) net from e group by 1 order by 1)
  select coalesce(jsonb_agg(jsonb_build_object('month',month_key,'income',income,'expenses',expenses,'net',net) order by month_key),'[]'::jsonb) into v_monthly from m;
  select count(*) into v_consolidated from financial_app.forecast_occurrences o join financial_app.forecasts f on f.id=o.forecast_id where o.status='consolidated' and o.occurrence_date between p_start and v_end and f.status<>'cancelled'::financial_app.forecast_status;
  return jsonb_build_object('version','0.8.0','startDate',p_start,'endDate',v_end,'days',p_days,'currentBalance',round(v_balance,2),'savingsBalance',round(v_savings,2),'projectedBalance',round(v_projected,2),'projectedIncome',round(v_income,2),'projectedExpenses',round(v_expenses,2),'projectedNet',round(v_net,2),'lowestBalance',round(v_lowest,2),'suggestions',v_suggestions,'events',v_events,'balanceSeries',v_series,'monthly',v_monthly,'savedForecasts',v_saved,'consolidatedCount',v_consolidated,'rules',jsonb_build_object('automaticSuggestionsAreReadOnly',true,'suggestionsAffectProjection',false,'historyWindowDays',730,'amountTolerancePercent',75,'dateToleranceDays',22,'stalePatternsExcluded',true,'futureSuggestedOccurrences',true));
end;$function$;
