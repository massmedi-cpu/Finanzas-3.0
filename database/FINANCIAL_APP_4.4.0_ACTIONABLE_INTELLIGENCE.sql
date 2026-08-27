begin;

-- Financial App 4.4.0 — inteligencia accionable, determinista y de solo lectura.
-- Deriva señales desde movimientos canónicos y reutiliza control_alert_states; no persiste importes analíticos.

create index if not exists transactions_intelligence_date_idx
  on financial_app.transactions((coalesce(effective_date,source_date)) desc)
  where source_missing=false and is_duplicate=false and is_internal_transfer=false;

create or replace function financial_app.actionable_intelligence_core(p_history_days integer default 400)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_days integer:=least(greatest(coalesce(p_history_days,400),180),730);
  v_result jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  with base as materialized(
    select t.id,t.source_id,coalesce(t.effective_date,t.source_date) d,
      abs(coalesce(t.personal_amount_override,t.source_amount))::numeric amount,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin comercio') merchant,
      financial_app.forecast_norm(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))) merchant_norm,
      coalesce(t.category_override,t.source_category,'Sin categoría') category,
      coalesce(t.subcategory_override,t.source_subcategory,'') subcategory
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating' and a.cash_flow_enabled=true
      and t.cash_flow_override is distinct from false
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.personal_amount_override,t.source_amount)<0
      and coalesce(t.effective_date,t.source_date)>=current_date-v_days
  ), anomaly_raw as(
    select b.*,h.n,h.median_amount,round(b.amount-h.median_amount,2) delta,
      round(b.amount/nullif(h.median_amount,0),2) ratio,
      'intelligence:anomaly:'||b.id::text alert_key
    from base b
    join lateral(
      select count(*)::int n,percentile_cont(.5) within group(order by p.amount)::numeric median_amount
      from base p
      where p.merchant_norm=b.merchant_norm and p.id<>b.id and p.d<b.d and p.d>=b.d-365
    ) h on h.n>=3
    where b.d>=current_date-45 and b.amount>=20
      and b.amount>=greatest(h.median_amount*1.75,h.median_amount+15)
  ), anomalies as(
    select a.*,
      case when s.state='snoozed' and s.snoozed_until<current_date then 'open' else coalesce(s.state,'open') end state,
      s.snoozed_until,
      coalesce(s.state,'open') not in('resolved','dismissed')
        and not(coalesce(s.state,'open')='snoozed' and s.snoozed_until>=current_date) visible
    from anomaly_raw a left join financial_app.control_alert_states s on s.alert_key=a.alert_key
  ), recurring_stats as(
    select merchant_norm,min(merchant) merchant,min(category) category,min(subcategory) subcategory,
      count(*)::int tx,count(distinct date_trunc('month',d))::int months,min(d) first_date,max(d) last_date,
      avg(amount)::numeric avg_amount,percentile_cont(.5) within group(order by amount)::numeric median_amount,
      coalesce(stddev_samp(amount)/nullif(avg(amount),0),0)::numeric cv,
      (max(d)-min(d))::numeric/nullif(count(*)-1,0) avg_interval,
      (array_agg(amount order by d desc,id desc))[1]::numeric last_amount
    from base where merchant_norm<>''
    group by merchant_norm
    having count(*)>=4 and count(distinct date_trunc('month',d))>=4
  ), recurring_raw as(
    select r.*,
      case
        when lower(r.category||' '||r.subcategory) ~ '(vivienda|comunidad|financi|hipoteca|impuesto|tasa|seguro|electric|agua)' then 'fixed_commitment'
        when lower(r.category||' '||r.subcategory) ~ '(ocio|entreten|tecnolog|software|streaming|suscrip|gimnas|membres)' then 'subscription_candidate'
        else 'recurring_charge'
      end classification,
      round(r.avg_amount,2) monthly_amount,round(r.avg_amount*12,2) annualized_amount,
      round(greatest(0,1-r.cv),3) stability,
      round((r.last_amount-r.median_amount)/nullif(r.median_amount,0),4) latest_change_ratio,
      'intelligence:recurring:'||md5(r.merchant_norm) alert_key
    from recurring_stats r
    where r.last_date>=current_date-45 and r.avg_amount>=2 and r.cv<=.15 and r.avg_interval between 20 and 45
  ), recurring as(
    select r.*,
      case when s.state='snoozed' and s.snoozed_until<current_date then 'open' else coalesce(s.state,'open') end state,
      s.snoozed_until,
      coalesce(s.state,'open') not in('resolved','dismissed')
        and not(coalesce(s.state,'open')='snoozed' and s.snoozed_until>=current_date) visible
    from recurring_raw r left join financial_app.control_alert_states s on s.alert_key=r.alert_key
  ), rising_base as(
    select category,
      sum(amount) filter(where d>=date_trunc('month',current_date)::date-interval '2 months' and d<date_trunc('month',current_date)::date)::numeric recent,
      sum(amount) filter(where d>=date_trunc('month',current_date)::date-interval '4 months' and d<date_trunc('month',current_date)::date-interval '2 months')::numeric previous,
      count(*) filter(where d>=date_trunc('month',current_date)::date-interval '2 months' and d<date_trunc('month',current_date)::date)::int recent_n,
      count(*) filter(where d>=date_trunc('month',current_date)::date-interval '4 months' and d<date_trunc('month',current_date)::date-interval '2 months')::int previous_n
    from base group by category
  ), rising_raw as(
    select r.*,round(r.recent-r.previous,2) delta,
      round((r.recent-r.previous)/nullif(r.previous,0),4) delta_ratio,
      'intelligence:rising:'||md5(financial_app.forecast_norm(r.category)) alert_key
    from rising_base r
    where r.recent_n>=2 and r.previous_n>=2 and r.previous>=20
      and r.recent>=r.previous*1.25 and r.recent-r.previous>=25
  ), rising as(
    select r.*,
      case when s.state='snoozed' and s.snoozed_until<current_date then 'open' else coalesce(s.state,'open') end state,
      s.snoozed_until,
      coalesce(s.state,'open') not in('resolved','dismissed')
        and not(coalesce(s.state,'open')='snoozed' and s.snoozed_until>=current_date) visible
    from rising_raw r left join financial_app.control_alert_states s on s.alert_key=r.alert_key
  ), opportunity_raw as(
    select category,count(distinct date_trunc('month',d))::int months,
      round(sum(amount)/3,2) monthly_average,
      round(sum(amount)/3*.10,2) monthly_scenario_savings,
      round(sum(amount)/3*.10*12,2) annual_scenario_savings,
      'intelligence:opportunity:'||md5(financial_app.forecast_norm(category)) alert_key
    from base
    where d>=date_trunc('month',current_date)::date-interval '3 months'
      and d<date_trunc('month',current_date)::date
      and lower(category||' '||subcategory) ~ '(hosteler|bares|restaur|ocio|entreten|compras|vending|tabaco|premios|streaming|software|suscrip)'
    group by category
    having count(distinct date_trunc('month',d))>=2 and sum(amount)/3>=20
  ), opportunities as(
    select o.*,
      case when s.state='snoozed' and s.snoozed_until<current_date then 'open' else coalesce(s.state,'open') end state,
      s.snoozed_until,
      coalesce(s.state,'open') not in('resolved','dismissed')
        and not(coalesce(s.state,'open')='snoozed' and s.snoozed_until>=current_date) visible
    from opportunity_raw o left join financial_app.control_alert_states s on s.alert_key=o.alert_key
  ), anomaly_json as(
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',alert_key,'kind','anomaly','severity',case when ratio>=3 or delta>=100 then 'high' else 'medium' end,
      'title','Gasto fuera de su patrón habitual','merchant',merchant,'category',category,'transactionId',id,'sourceId',source_id,'date',d,
      'amount',round(amount,2),'baselineMedian',round(median_amount,2),'difference',delta,'ratio',ratio,'historyCount',n,
      'state',state,'snoozedUntil',snoozed_until
    ) order by ratio desc,delta desc,d desc) filter(where visible),'[]'::jsonb) items,
    count(*) filter(where visible)::int visible_count,count(*) filter(where not visible)::int hidden_count
    from anomalies
  ), recurring_json as(
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',alert_key,'kind','recurring','severity',case when latest_change_ratio>=.15 and last_amount-median_amount>=2 then 'medium' else 'low' end,
      'title',case classification when 'subscription_candidate' then 'Posible suscripción o membresía' when 'fixed_commitment' then 'Compromiso periódico estable' else 'Cargo periódico estable' end,
      'merchant',merchant,'category',category,'subcategory',subcategory,'classification',classification,'monthsObserved',months,'transactions',tx,
      'firstDate',first_date,'lastDate',last_date,'monthlyAmount',monthly_amount,'annualizedAmount',annualized_amount,'stability',stability,
      'latestAmount',round(last_amount,2),'baselineMedian',round(median_amount,2),'latestChangeRatio',latest_change_ratio,
      'state',state,'snoozedUntil',snoozed_until
    ) order by case classification when 'subscription_candidate' then 0 when 'recurring_charge' then 1 else 2 end,annualized_amount desc) filter(where visible),'[]'::jsonb) items,
    count(*) filter(where visible)::int visible_count,count(*) filter(where not visible)::int hidden_count
    from recurring
  ), rising_json as(
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',alert_key,'kind','rising','severity',case when delta_ratio>=.5 and delta>=100 then 'high' else 'medium' end,
      'title','El gasto de esta categoría está subiendo','category',category,'recentSpend',round(recent,2),'previousSpend',round(previous,2),
      'difference',delta,'changeRatio',delta_ratio,'recentTransactions',recent_n,'previousTransactions',previous_n,
      'state',state,'snoozedUntil',snoozed_until
    ) order by delta desc) filter(where visible),'[]'::jsonb) items,
    count(*) filter(where visible)::int visible_count,count(*) filter(where not visible)::int hidden_count
    from rising
  ), opportunity_json as(
    select coalesce(jsonb_agg(jsonb_build_object(
      'key',alert_key,'kind','opportunity','severity','low','title','Escenario voluntario de ahorro del 10%','category',category,'monthsObserved',months,
      'monthlyAverage',monthly_average,'scenarioPercent',10,'monthlyScenarioSavings',monthly_scenario_savings,'annualScenarioSavings',annual_scenario_savings,
      'state',state,'snoozedUntil',snoozed_until
    ) order by annual_scenario_savings desc) filter(where visible),'[]'::jsonb) items,
    count(*) filter(where visible)::int visible_count,count(*) filter(where not visible)::int hidden_count,
    coalesce(round(sum(monthly_scenario_savings) filter(where visible),2),0)::numeric monthly_scenario,
    coalesce(round(sum(annual_scenario_savings) filter(where visible),2),0)::numeric annual_scenario
    from opportunities
  )
  select jsonb_build_object(
    'ok',true,'version','4.4.0','generatedAt',now(),'historyDays',v_days,
    'summary',jsonb_build_object(
      'anomalies',a.visible_count,'recurring',rc.visible_count,'rising',ri.visible_count,'opportunities',o.visible_count,
      'hidden',a.hidden_count+rc.hidden_count+ri.hidden_count+o.hidden_count,
      'monthlySavingsScenario',o.monthly_scenario,'annualSavingsScenario',o.annual_scenario
    ),
    'anomalies',a.items,'recurring',rc.items,'rising',ri.items,'opportunities',o.items,
    'rules',jsonb_build_object(
      'anomalyHistoryMinimum',3,'anomalyRatioThreshold',1.75,'anomalyAbsoluteDifference',15,'anomalyRecentDays',45,
      'recurringMinimumMonths',4,'recurringCvMaximum',.15,'recurringIntervalMinDays',20,'recurringIntervalMaxDays',45,
      'risingComparisonMonths',2,'risingThresholdPercent',25,'savingsScenarioPercent',10,
      'usesCompleteMonthsForTrends',true,'sourceReadOnly',true,'reusesControlAlertStates',true,'financialValuesPersisted',false
    )
  ) into v_result
  from anomaly_json a cross join recurring_json rc cross join rising_json ri cross join opportunity_json o;

  return v_result;
end
$$;

revoke all on function financial_app.actionable_intelligence_core(integer) from public,anon;
grant execute on function financial_app.actionable_intelligence_core(integer) to authenticated,service_role;

create or replace function public.financial_app_actionable_intelligence(p_history_days integer default 400)
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app
as $$ select financial_app.actionable_intelligence_core(p_history_days) $$;
revoke all on function public.financial_app_actionable_intelligence(integer) from public,anon;
grant execute on function public.financial_app_actionable_intelligence(integer) to authenticated,service_role;

-- La frontera pública de observabilidad presenta la versión canónica del release,
-- sin reescribir el núcleo 4.3 que define la semántica de sus métricas.
create or replace function public.financial_app_matching_observability(p_recent_days integer default 90)
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app
as $$
  select financial_app.matching_observability_core(p_recent_days)
    || jsonb_build_object('version',coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'4.4.0'))
$$;
revoke all on function public.financial_app_matching_observability(integer) from public,anon;
grant execute on function public.financial_app_matching_observability(integer) to authenticated,service_role;

update financial_app.app_meta
set value=to_jsonb('4.4.0'::text),updated_at=now()
where key in('app_version','target_version');

notify pgrst,'reload schema';
commit;
