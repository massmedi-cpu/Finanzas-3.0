begin;

-- Financial App 7.0.0 · Agenda Financiera Inteligente.
-- Capa aditiva y de solo lectura sobre forecast_calendar_visible_core.
-- No modifica movimientos, saldos de origen, documentos ni previsiones existentes.
create or replace function financial_app.forecast_liquidity_core(
  p_start date default current_date,
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_start date:=coalesce(p_start,current_date);
  v_days integer:=greatest(7,least(180,coalesce(p_days,90)));
  v_end date;
  v_months integer;
  v_calendar jsonb;
  v_opening numeric:=0;
  v_daily jsonb:='[]'::jsonb;
  v_commitments jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
  v_horizons jsonb:='{}'::jsonb;
  v_confidence jsonb:='{}'::jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_end:=v_start+(v_days-1);
  v_months:=greatest(1,least(18,ceil(v_days/28.0)::int));
  v_calendar:=financial_app.forecast_calendar_visible_core(v_start,v_months);

  select coalesce(sum(x.balance),0)
  into v_opening
  from financial_app.accounts a
  left join lateral(
    select t.source_balance::numeric balance
    from financial_app.transactions t
    where t.account_id=a.id
      and t.source_identifier=a.external_identifier
      and t.source_missing=false
      and t.source_balance is not null
    order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc
    limit 1
  )x on true
  where a.active=true
    and a.account_role='operating'
    and a.cash_flow_enabled=true;

  with event_rows as(
    select
      e.item,
      e.ord::bigint ord,
      (e.item->>'estimatedDate')::date estimated_date,
      greatest((e.item->>'estimatedDate')::date,v_start) effective_date,
      (e.item->>'estimatedAmount')::numeric amount,
      greatest(0::numeric,least(1::numeric,coalesce((e.item->>'confidence')::numeric,0))) confidence,
      coalesce(e.item->>'status','expected') status
    from jsonb_array_elements(coalesce(v_calendar->'events','[]'::jsonb)) with ordinality e(item,ord)
    where coalesce(e.item->>'status','expected')<>'received'
      and (e.item->>'estimatedDate')::date<=v_end
  ),daily_events as(
    select effective_date,
      coalesce(sum(amount) filter(where amount>0),0)::numeric income,
      coalesce(abs(sum(amount) filter(where amount<0)),0)::numeric expenses,
      coalesce(sum(amount),0)::numeric net,
      count(*)::int event_count,
      count(*) filter(where confidence<.65)::int uncertain_count
    from event_rows
    group by effective_date
  ),days as(
    select gs::date day
    from generate_series(v_start,v_end,interval '1 day') gs
  ),series as(
    select d.day,
      round(coalesce(e.income,0),2) income,
      round(coalesce(e.expenses,0),2) expenses,
      round(coalesce(e.net,0),2) net,
      coalesce(e.event_count,0)::int event_count,
      coalesce(e.uncertain_count,0)::int uncertain_count,
      round(v_opening+sum(coalesce(e.net,0)) over(order by d.day rows between unbounded preceding and current row),2) projected_balance
    from days d left join daily_events e on e.effective_date=d.day
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'date',day,'income',income,'expenses',expenses,'net',net,
      'eventCount',event_count,'uncertainEvents',uncertain_count,'projectedBalance',projected_balance
    ) order by day),'[]'::jsonb),
    jsonb_build_object(
      'openingBalance',round(v_opening,2),
      'projectedEndBalance',coalesce((select projected_balance from series order by day desc limit 1),round(v_opening,2)),
      'minimumProjectedBalance',coalesce((select projected_balance from series order by projected_balance,day limit 1),round(v_opening,2)),
      'minimumBalanceDate',(select day from series order by projected_balance,day limit 1),
      'daysBelowZero',(select count(*)::int from series where projected_balance<0),
      'pendingIncome',round(coalesce((select sum(amount) from event_rows where amount>0),0),2),
      'pendingExpenses',round(coalesce(abs((select sum(amount) from event_rows where amount<0)),0),2),
      'pendingNet',round(coalesce((select sum(amount) from event_rows),0),2),
      'pendingEvents',(select count(*)::int from event_rows),
      'overdueEvents',(select count(*)::int from event_rows where estimated_date<v_start)
    ),
    jsonb_build_object(
      '30',case when v_days>=30 then (select projected_balance from series where day<=v_start+29 order by day desc limit 1) else null end,
      '60',case when v_days>=60 then (select projected_balance from series where day<=v_start+59 order by day desc limit 1) else null end,
      '90',case when v_days>=90 then (select projected_balance from series where day<=v_start+89 order by day desc limit 1) else null end
    ),
    jsonb_build_object(
      'high',(select count(*)::int from event_rows where confidence>=.80),
      'medium',(select count(*)::int from event_rows where confidence>=.65 and confidence<.80),
      'low',(select count(*)::int from event_rows where confidence<.65)
    )
  into v_daily,v_summary,v_horizons,v_confidence
  from series;

  with event_rows as(
    select
      e.item,
      e.ord::bigint ord,
      (e.item->>'estimatedDate')::date estimated_date,
      greatest((e.item->>'estimatedDate')::date,v_start) effective_date,
      (e.item->>'estimatedAmount')::numeric amount,
      greatest(0::numeric,least(1::numeric,coalesce((e.item->>'confidence')::numeric,0))) confidence
    from jsonb_array_elements(coalesce(v_calendar->'events','[]'::jsonb)) with ordinality e(item,ord)
    where coalesce(e.item->>'status','expected')<>'received'
      and (e.item->>'estimatedDate')::date<=v_end
  ),daily_balance as(
    select (d.item->>'date')::date day,(d.item->>'projectedBalance')::numeric projected_balance
    from jsonb_array_elements(v_daily) d(item)
  ),ranked as(
    select e.*,row_number() over(order by e.effective_date,abs(e.amount) desc,e.ord) rn
    from event_rows e
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',r.item->>'id',
      'title',r.item->>'title',
      'estimatedDate',r.estimated_date,
      'effectiveDate',r.effective_date,
      'estimatedAmount',round(r.amount,2),
      'category',r.item->>'category',
      'counterparty',r.item->>'counterparty',
      'source',coalesce(r.item->>'source','automatic'),
      'frequency',coalesce(r.item->>'frequency','monthly'),
      'status',coalesce(r.item->>'status','expected'),
      'confidence',round(r.confidence,3),
      'confidenceLevel',case when r.confidence>=.80 then 'high' when r.confidence>=.65 then 'medium' else 'low' end,
      'toleranceDays',greatest(0,coalesce((r.item->>'toleranceDays')::int,0)),
      'explanation',coalesce(r.item->'explanation','{}'::jsonb),
      'projectedDayBalance',b.projected_balance
    ) order by r.rn
  ) filter(where r.rn<=12),'[]'::jsonb)
  into v_commitments
  from ranked r left join daily_balance b on b.day=r.effective_date;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'startDate',v_start,
    'endDate',v_end,
    'days',v_days,
    'summary',v_summary,
    'horizons',v_horizons,
    'confidence',v_confidence,
    'daily',v_daily,
    'commitments',v_commitments,
    'rules',jsonb_build_object(
      'usesCanonicalForecast',true,
      'operatingAccountsOnly',true,
      'cashFlowEnabledAccountsOnly',true,
      'receivedEventsNotDoubleCounted',true,
      'overdueAppliedAtStart',true,
      'sourceBalancesReadOnly',true,
      'maximumDays',180
    )
  );
end
$$;

revoke all on function financial_app.forecast_liquidity_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_liquidity_core(date,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_liquidity(
  p_start date default current_date,
  p_days integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path='pg_catalog','financial_app'
as $$
  select financial_app.forecast_liquidity_core(p_start,p_days)
$$;

revoke all on function public.financial_app_forecast_liquidity(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_liquidity(date,integer) to authenticated,service_role;

commit;