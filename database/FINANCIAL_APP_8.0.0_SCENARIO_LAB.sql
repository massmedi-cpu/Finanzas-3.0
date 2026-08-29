begin;

-- Financial App 8.0.0 · Simulador de Decisiones.
-- Motor efímero y de solo lectura construido exclusivamente sobre la liquidez canónica 7.0.
-- No persiste escenarios ni modifica movimientos, cuentas, previsiones, documentos o saldos de origen.
create or replace function financial_app.forecast_scenario_core(
  p_start date default current_date,
  p_days integer default 90,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_email text;
  v_start date:=coalesce(p_start,current_date);
  v_days integer:=greatest(7,least(180,coalesce(p_days,90)));
  v_end date;
  v_events jsonb:=coalesce(p_events,'[]'::jsonb);
  v_baseline jsonb;
  v_daily jsonb:='[]'::jsonb;
  v_expanded jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
  v_horizons jsonb:='{}'::jsonb;
  v_definition_count integer:=0;
  v_occurrence_count integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  if jsonb_typeof(v_events) is distinct from 'array' then
    raise exception 'scenario_events_must_be_array' using errcode='22023';
  end if;

  v_definition_count:=jsonb_array_length(v_events);
  if v_definition_count>24 then
    raise exception 'scenario_too_many_definitions' using errcode='22023';
  end if;

  v_end:=v_start+(v_days-1);
  v_baseline:=financial_app.forecast_liquidity_core(v_start,v_days);

  if exists(
    select 1
    from jsonb_array_elements(v_events) e(item)
    where length(trim(coalesce(e.item->>'title','')))=0
      or length(trim(coalesce(e.item->>'title','')))>100
      or coalesce(e.item->>'kind','once') not in('once','monthly','installments')
      or coalesce((e.item->>'amount')::numeric,0)=0
      or abs(coalesce((e.item->>'amount')::numeric,0))>100000000
      or (e.item->>'date') is null
      or (e.item->>'date')::date<v_start
      or (e.item->>'date')::date>v_end
      or case when coalesce(e.item->>'kind','once')='once' then false
              else greatest(1,coalesce((e.item->>'count')::int,1))>24 end
      or greatest(1,coalesce((e.item->>'intervalMonths')::int,1))>12
  ) then
    raise exception 'invalid_scenario_definition' using errcode='22023';
  end if;

  with definitions as(
    select
      coalesce(nullif(trim(e.item->>'id'),''),'scenario-'||e.ord::text) id,
      trim(e.item->>'title') title,
      (e.item->>'date')::date first_date,
      round((e.item->>'amount')::numeric,2) amount,
      coalesce(e.item->>'kind','once') kind,
      case when coalesce(e.item->>'kind','once')='once' then 1 else greatest(1,coalesce((e.item->>'count')::int,1)) end occurrence_count,
      greatest(1,coalesce((e.item->>'intervalMonths')::int,1)) interval_months,
      e.ord::bigint definition_order
    from jsonb_array_elements(v_events) with ordinality e(item,ord)
  ),expanded as(
    select d.*,
      g.n+1 occurrence,
      (d.first_date+make_interval(months=>(g.n*d.interval_months)))::date event_date
    from definitions d
    cross join lateral generate_series(0,d.occurrence_count-1) g(n)
  )
  select count(*)::int into v_occurrence_count
  from expanded
  where event_date<=v_end;

  if v_occurrence_count>120 then
    raise exception 'scenario_too_many_occurrences' using errcode='22023';
  end if;

  with definitions as(
    select
      coalesce(nullif(trim(e.item->>'id'),''),'scenario-'||e.ord::text) id,
      trim(e.item->>'title') title,
      (e.item->>'date')::date first_date,
      round((e.item->>'amount')::numeric,2) amount,
      coalesce(e.item->>'kind','once') kind,
      case when coalesce(e.item->>'kind','once')='once' then 1 else greatest(1,coalesce((e.item->>'count')::int,1)) end occurrence_count,
      greatest(1,coalesce((e.item->>'intervalMonths')::int,1)) interval_months,
      e.ord::bigint definition_order
    from jsonb_array_elements(v_events) with ordinality e(item,ord)
  ),expanded as(
    select d.*,
      g.n+1 occurrence,
      (d.first_date+make_interval(months=>(g.n*d.interval_months)))::date event_date
    from definitions d
    cross join lateral generate_series(0,d.occurrence_count-1) g(n)
    where (d.first_date+make_interval(months=>(g.n*d.interval_months)))::date<=v_end
  ),scenario_daily as(
    select event_date,
      round(coalesce(sum(amount),0),2) net,
      count(*)::int occurrence_count
    from expanded
    group by event_date
  ),baseline_days as(
    select
      (d.item->>'date')::date projection_date,
      (d.item->>'projectedBalance')::numeric baseline_balance
    from jsonb_array_elements(coalesce(v_baseline->'daily','[]'::jsonb)) d(item)
  ),series as(
    select b.projection_date,
      round(b.baseline_balance,2) baseline_balance,
      round(coalesce(s.net,0),2) scenario_net,
      coalesce(s.occurrence_count,0)::int scenario_occurrences,
      round(b.baseline_balance+sum(coalesce(s.net,0)) over(order by b.projection_date rows between unbounded preceding and current row),2) scenario_balance
    from baseline_days b
    left join scenario_daily s on s.event_date=b.projection_date
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'date',projection_date,
      'baselineBalance',baseline_balance,
      'scenarioNet',scenario_net,
      'scenarioOccurrences',scenario_occurrences,
      'scenarioBalance',scenario_balance
    ) order by projection_date),'[]'::jsonb),
    jsonb_build_object(
      'openingBalance',coalesce((v_baseline->'summary'->>'openingBalance')::numeric,0),
      'baselineEndBalance',coalesce((v_baseline->'summary'->>'projectedEndBalance')::numeric,0),
      'scenarioEndBalance',coalesce((select scenario_balance from series order by projection_date desc limit 1),coalesce((v_baseline->'summary'->>'openingBalance')::numeric,0)),
      'endBalanceDelta',coalesce((select scenario_balance from series order by projection_date desc limit 1),0)-coalesce((v_baseline->'summary'->>'projectedEndBalance')::numeric,0),
      'baselineMinimumBalance',coalesce((v_baseline->'summary'->>'minimumProjectedBalance')::numeric,0),
      'scenarioMinimumBalance',coalesce((select scenario_balance from series order by scenario_balance,projection_date limit 1),coalesce((v_baseline->'summary'->>'openingBalance')::numeric,0)),
      'scenarioMinimumDate',(select projection_date from series order by scenario_balance,projection_date limit 1),
      'minimumBalanceDelta',coalesce((select scenario_balance from series order by scenario_balance,projection_date limit 1),0)-coalesce((v_baseline->'summary'->>'minimumProjectedBalance')::numeric,0),
      'baselineDaysBelowZero',coalesce((v_baseline->'summary'->>'daysBelowZero')::int,0),
      'scenarioDaysBelowZero',(select count(*)::int from series where scenario_balance<0),
      'daysBelowZeroDelta',(select count(*)::int from series where scenario_balance<0)-coalesce((v_baseline->'summary'->>'daysBelowZero')::int,0),
      'firstNegativeDate',(select projection_date from series where scenario_balance<0 order by projection_date limit 1),
      'hypotheticalNet',round(coalesce((select sum(amount) from expanded),0),2),
      'definitions',v_definition_count,
      'occurrences',v_occurrence_count,
      'crossesZero',exists(select 1 from series where scenario_balance<0)
    ),
    jsonb_build_object(
      '30',case when v_days>=30 then (select scenario_balance from series where projection_date<=v_start+29 order by projection_date desc limit 1) else null end,
      '60',case when v_days>=60 then (select scenario_balance from series where projection_date<=v_start+59 order by projection_date desc limit 1) else null end,
      '90',case when v_days>=90 then (select scenario_balance from series where projection_date<=v_start+89 order by projection_date desc limit 1) else null end
    )
  into v_daily,v_summary,v_horizons
  from series;

  with definitions as(
    select
      coalesce(nullif(trim(e.item->>'id'),''),'scenario-'||e.ord::text) id,
      trim(e.item->>'title') title,
      (e.item->>'date')::date first_date,
      round((e.item->>'amount')::numeric,2) amount,
      coalesce(e.item->>'kind','once') kind,
      case when coalesce(e.item->>'kind','once')='once' then 1 else greatest(1,coalesce((e.item->>'count')::int,1)) end occurrence_count,
      greatest(1,coalesce((e.item->>'intervalMonths')::int,1)) interval_months,
      e.ord::bigint definition_order
    from jsonb_array_elements(v_events) with ordinality e(item,ord)
  ),expanded as(
    select d.*,
      g.n+1 occurrence,
      (d.first_date+make_interval(months=>(g.n*d.interval_months)))::date event_date
    from definitions d
    cross join lateral generate_series(0,d.occurrence_count-1) g(n)
    where (d.first_date+make_interval(months=>(g.n*d.interval_months)))::date<=v_end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'definitionId',id,
    'title',title,
    'kind',kind,
    'date',event_date,
    'amount',amount,
    'occurrence',occurrence,
    'occurrenceCount',occurrence_count,
    'intervalMonths',interval_months
  ) order by event_date,definition_order,occurrence),'[]'::jsonb)
  into v_expanded
  from expanded;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'startDate',v_start,
    'endDate',v_end,
    'days',v_days,
    'baseline',jsonb_build_object(
      'summary',coalesce(v_baseline->'summary','{}'::jsonb),
      'horizons',coalesce(v_baseline->'horizons','{}'::jsonb)
    ),
    'summary',v_summary,
    'horizons',v_horizons,
    'daily',v_daily,
    'expandedEvents',v_expanded,
    'rules',jsonb_build_object(
      'usesCanonicalLiquidity',true,
      'ephemeral',true,
      'noPersistence',true,
      'sourceDataReadOnly',true,
      'maximumDays',180,
      'maximumDefinitions',24,
      'maximumOccurrences',120
    )
  );
end
$$;

revoke all on function financial_app.forecast_scenario_core(date,integer,jsonb) from public,anon;
grant execute on function financial_app.forecast_scenario_core(date,integer,jsonb) to authenticated,service_role;

create or replace function public.financial_app_forecast_scenario(
  p_start date default current_date,
  p_days integer default 90,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path='pg_catalog','financial_app'
as $$
  select financial_app.forecast_scenario_core(p_start,p_days,p_events)
$$;

revoke all on function public.financial_app_forecast_scenario(date,integer,jsonb) from public,anon;
grant execute on function public.financial_app_forecast_scenario(date,integer,jsonb) to authenticated,service_role;

commit;