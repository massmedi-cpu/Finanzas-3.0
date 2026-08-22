-- Financial App 1.0.0-rc.1 · Simulador de escenarios de previsión
-- Solo lectura: no crea movimientos, previsiones ni ocurrencias y nunca usa ahorro.

create or replace function financial_app.forecast_scenario_core(
  p_start date default current_date,
  p_days integer default 90,
  p_title text default 'Escenario',
  p_amount numeric default 0,
  p_scenario_date date default current_date,
  p_frequency text default 'once',
  p_interval integer default 1,
  p_occurrences integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_end date;
  v_balance numeric:=0;
  v_savings numeric:=0;
  v_frequency text:=lower(trim(coalesce(p_frequency,'once')));
  v_interval integer:=greatest(1,least(coalesce(p_interval,1),12));
  v_occurrences integer:=greatest(1,least(coalesce(p_occurrences,1),60));
  v_title text:=coalesce(nullif(trim(coalesce(p_title,'')),''),'Escenario');
  v_base_events jsonb:='[]'::jsonb;
  v_scenario_events jsonb:='[]'::jsonb;
  v_base_series jsonb:='[]'::jsonb;
  v_scenario_series jsonb:='[]'::jsonb;
  v_base_net numeric:=0;
  v_scenario_delta numeric:=0;
  v_base_projected numeric:=0;
  v_scenario_projected numeric:=0;
  v_base_lowest numeric:=0;
  v_scenario_lowest numeric:=0;
  v_first_negative date;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  p_start:=coalesce(p_start,current_date);
  p_days:=greatest(30,least(coalesce(p_days,90),365));
  v_end:=p_start+p_days;
  if p_amount is null or p_amount=0 or abs(p_amount)>10000000 then raise exception 'invalid_scenario_amount'; end if;
  if p_scenario_date is null or p_scenario_date<p_start or p_scenario_date>v_end then raise exception 'scenario_date_outside_horizon'; end if;
  if v_frequency not in('once','weekly','monthly','yearly') then raise exception 'invalid_scenario_frequency'; end if;
  if v_frequency='once' then v_occurrences:=1; end if;

  select coalesce(b.source_balance,0) into v_balance
  from financial_app.accounts a
  left join lateral(
    select t.source_balance from financial_app.transactions t
    where t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null
    order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
  ) b on true
  where a.active=true and a.account_role='operating'
  order by a.created_at limit 1;
  v_balance:=coalesce(v_balance,0);

  select coalesce(sum(b.source_balance),0) into v_savings
  from financial_app.accounts a
  left join lateral(
    select t.source_balance from financial_app.transactions t
    where t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null
    order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
  ) b on true
  where a.active=true and a.account_role='savings';

  with generated as(
    select f.id forecast_id,f.title,f.predicted_amount amount,x.d event_date
    from financial_app.forecasts f
    cross join lateral(
      select f.predicted_date::date d where f.recurrence_rule is null
      union all
      select case coalesce(f.recurrence_rule->>'frequency','monthly')
        when 'weekly' then (f.predicted_date + make_interval(weeks=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date
        when 'yearly' then (f.predicted_date + make_interval(years=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date
        else (f.predicted_date + make_interval(months=>n*greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date end d
      from generate_series(0,120) n where f.recurrence_rule is not null
    ) x
    where f.status<>'cancelled'::financial_app.forecast_status
      and x.d between p_start and v_end
      and x.d<=coalesce(nullif(f.recurrence_rule->>'until','')::date,v_end)
      and not exists(
        select 1 from financial_app.forecast_occurrences o
        where o.forecast_id=f.id and o.occurrence_date=x.d and o.status='consolidated'
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',forecast_id::text||':'||event_date::text,'date',event_date,'amount',amount,'title',title,'source','saved') order by event_date,forecast_id),'[]'::jsonb),coalesce(sum(amount),0)
  into v_base_events,v_base_net from generated;

  with scenario as(
    select n,
      case v_frequency
        when 'once' then p_scenario_date
        when 'weekly' then (p_scenario_date+make_interval(weeks=>n*v_interval))::date
        when 'yearly' then (p_scenario_date+make_interval(years=>n*v_interval))::date
        else (p_scenario_date+make_interval(months=>n*v_interval))::date
      end event_date
    from generate_series(0,v_occurrences-1) n
  ), valid as(select * from scenario where event_date between p_start and v_end)
  select coalesce(jsonb_agg(jsonb_build_object('id','scenario:'||n::text,'date',event_date,'amount',p_amount,'title',v_title,'source','scenario') order by event_date,n),'[]'::jsonb),coalesce(count(*)*p_amount,0)
  into v_scenario_events,v_scenario_delta from valid;

  v_base_projected:=v_balance+v_base_net;
  v_scenario_projected:=v_base_projected+v_scenario_delta;

  with e as(
    select * from jsonb_to_recordset(v_base_events) as x(id text,"date" date,amount numeric,title text,source text)
  ), daily as(select "date",sum(amount) amount,string_agg(title,' · ' order by id) title from e group by "date"),
  o as(select "date",amount,title,sum(amount) over(order by "date") cum from daily),
  points as(select 0 seq,p_start point_date,v_balance balance,'Saldo actual' title,'current' source union all select row_number() over(order by "date")::int,"date",v_balance+cum,title,'saved' from o)
  select coalesce(min(balance),v_balance),coalesce(jsonb_agg(jsonb_build_object('date',point_date,'balance',round(balance,2),'title',title,'source',source) order by seq),'[]'::jsonb)
  into v_base_lowest,v_base_series from points;

  with all_events as(
    select * from jsonb_to_recordset(v_base_events||v_scenario_events) as x(id text,"date" date,amount numeric,title text,source text)
  ), daily as(select "date",sum(amount) amount,string_agg(title,' · ' order by id) title,bool_or(source='scenario') has_scenario from all_events group by "date"),
  o as(select "date",amount,title,has_scenario,sum(amount) over(order by "date") cum from daily),
  points as(select 0 seq,p_start point_date,v_balance balance,'Saldo actual' title,'current' source union all select row_number() over(order by "date")::int,"date",v_balance+cum,title,case when has_scenario then 'scenario' else 'saved' end from o)
  select coalesce(min(balance),v_balance),min(point_date) filter(where balance<0),coalesce(jsonb_agg(jsonb_build_object('date',point_date,'balance',round(balance,2),'title',title,'source',source) order by seq),'[]'::jsonb)
  into v_scenario_lowest,v_first_negative,v_scenario_series from points;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'startDate',p_start,'endDate',v_end,'days',p_days,
    'currentBalance',round(v_balance,2),'savingsBalance',round(v_savings,2),
    'baseline',jsonb_build_object('projectedBalance',round(v_base_projected,2),'net',round(v_base_net,2),'lowestBalance',round(v_base_lowest,2),'events',v_base_events,'balanceSeries',v_base_series),
    'scenario',jsonb_build_object('title',v_title,'amount',round(p_amount,2),'date',p_scenario_date,'frequency',v_frequency,'interval',v_interval,'requestedOccurrences',v_occurrences,'events',v_scenario_events,'delta',round(v_scenario_delta,2),'projectedBalance',round(v_scenario_projected,2),'lowestBalance',round(v_scenario_lowest,2),'firstNegativeDate',v_first_negative,'balanceSeries',v_scenario_series),
    'rules',jsonb_build_object('readOnly',true,'savingsUsed',false,'suggestionsIncluded',false,'officialForecastsModified',false)
  );
end $$;

revoke all on function financial_app.forecast_scenario_core(date,integer,text,numeric,date,text,integer,integer) from public,anon;
grant execute on function financial_app.forecast_scenario_core(date,integer,text,numeric,date,text,integer,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_scenario(
  p_start date default current_date,
  p_days integer default 90,
  p_title text default 'Escenario',
  p_amount numeric default 0,
  p_scenario_date date default current_date,
  p_frequency text default 'once',
  p_interval integer default 1,
  p_occurrences integer default 1
)
returns jsonb
language sql
stable
security invoker
set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.forecast_scenario_core(p_start,p_days,p_title,p_amount,p_scenario_date,p_frequency,p_interval,p_occurrences) $$;

revoke all on function public.financial_app_forecast_scenario(date,integer,text,numeric,date,text,integer,integer) from public,anon;
grant execute on function public.financial_app_forecast_scenario(date,integer,text,numeric,date,text,integer,integer) to authenticated,service_role;
