begin;

-- Financial App 9.0.0 · Facturas pendientes inteligentes.
--
-- Integra evidencia documental reciente en la previsión canónica sin crear un segundo
-- motor financiero ni modificar documentos, movimientos, saldos o previsiones de origen.
-- Una factura solo se incorpora cuando:
--   1) está activa, completa y fechada recientemente;
--   2) todavía no está asociada a ningún movimiento;
--   3) el matcher documental canónico no encuentra ya un movimiento candidato;
--   4) el calendario canónico no contiene ya un evento equivalente.
-- El descarte sigue usando forecast_event_overrides y, por tanto, es reversible.

create or replace function financial_app.forecast_calendar_document_commitments_core(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_email text;
  v_base jsonb;
  v_start date;
  v_end date;
  v_invoice_all jsonb:='[]'::jsonb;
  v_invoice_visible jsonb:='[]'::jsonb;
  v_invoice_dismissed jsonb:='[]'::jsonb;
  v_events jsonb:='[]'::jsonb;
  v_dismissed jsonb:='[]'::jsonb;
  v_projection_months jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_expected integer:=0;
  v_received integer:=0;
  v_late integer:=0;
  v_dismissed_count integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_base:=financial_app.forecast_calendar_visible_core(p_start,p_months);
  v_start:=(v_base->>'startDate')::date;
  v_end:=(v_base->>'endDate')::date;

  with fresh_documents as(
    select
      d.id document_id,
      d.document_date,
      abs(d.amount)::numeric amount,
      trim(d.merchant) merchant,
      financial_app.forecast_norm(d.merchant) merchant_key,
      d.ocr_data,
      case
        when coalesce(d.ocr_data->>'chargeDate','')~'^\d{4}-\d{2}-\d{2}$' then (d.ocr_data->>'chargeDate')::date
        when coalesce(d.ocr_data->>'paymentDate','')~'^\d{4}-\d{2}-\d{2}$' then (d.ocr_data->>'paymentDate')::date
        when coalesce(d.ocr_data->>'dueDate','')~'^\d{4}-\d{2}-\d{2}$' then (d.ocr_data->>'dueDate')::date
        else d.document_date+7
      end estimated_date,
      case
        when coalesce(d.ocr_data->>'chargeDate','')~'^\d{4}-\d{2}-\d{2}$' then 'charge_date'
        when coalesce(d.ocr_data->>'paymentDate','')~'^\d{4}-\d{2}-\d{2}$' then 'payment_date'
        when coalesce(d.ocr_data->>'dueDate','')~'^\d{4}-\d{2}-\d{2}$' then 'due_date'
        else 'invoice_date_plus_7'
      end date_basis,
      case
        when coalesce(d.ocr_data->>'chargeDate','')~'^\d{4}-\d{2}-\d{2}$' then .80::numeric
        when coalesce(d.ocr_data->>'paymentDate','')~'^\d{4}-\d{2}-\d{2}$' then .78::numeric
        when coalesce(d.ocr_data->>'dueDate','')~'^\d{4}-\d{2}-\d{2}$' then .68::numeric
        else .55::numeric
      end confidence,
      case
        when coalesce(d.ocr_data->>'chargeDate','')~'^\d{4}-\d{2}-\d{2}$' then 2
        when coalesce(d.ocr_data->>'paymentDate','')~'^\d{4}-\d{2}-\d{2}$' then 3
        when coalesce(d.ocr_data->>'dueDate','')~'^\d{4}-\d{2}-\d{2}$' then 5
        else 7
      end tolerance_days
    from financial_app.documents d
    where d.archived_at is null
      and d.document_type='invoice'
      and d.ocr_status='complete'
      and d.document_date is not null
      and d.document_date between current_date-45 and current_date+30
      and d.amount is not null and abs(d.amount)>=1
      and nullif(trim(coalesce(d.merchant,'')),'') is not null
      and not exists(
        select 1 from financial_app.transaction_documents td
        where td.document_id=d.id
      )
  ),eligible as(
    select f.*,
      'pending-invoice:'||f.document_id::text event_id,
      md5('pending-invoice:'||f.document_id::text) pattern_id
    from fresh_documents f
    where f.estimated_date<=v_end
      and not exists(
        select 1
        from financial_app.document_match_candidates_rows_core(f.document_id,1) c
        limit 1
      )
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_base->'events','[]'::jsonb)) b(item)
        where coalesce(b.item->>'estimatedAmount','')~'^-?[0-9]+(?:\.[0-9]+)?$'
          and (b.item->>'estimatedAmount')::numeric<0
          and abs(abs((b.item->>'estimatedAmount')::numeric)-f.amount)<=greatest(3::numeric,f.amount*.20)
          and coalesce(b.item->>'estimatedDate','')~'^\d{4}-\d{2}-\d{2}$'
          and(
            abs((b.item->>'estimatedDate')::date-f.estimated_date)<=greatest(14,coalesce((b.item->>'toleranceDays')::int,0))
            or (b.item->>'estimatedDate')::date between f.document_date-7 and f.document_date+45
          )
          and f.merchant_key<>''
          and financial_app.forecast_norm(coalesce(nullif(b.item->>'counterparty',''),nullif(b.item->>'title','')))<>''
          and(
            financial_app.forecast_norm(coalesce(nullif(b.item->>'counterparty',''),nullif(b.item->>'title','')))=f.merchant_key
            or position(f.merchant_key in financial_app.forecast_norm(coalesce(nullif(b.item->>'counterparty',''),nullif(b.item->>'title',''))))>0
            or position(financial_app.forecast_norm(coalesce(nullif(b.item->>'counterparty',''),nullif(b.item->>'title',''))) in f.merchant_key)>0
          )
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',event_id,
    'patternId',pattern_id,
    'forecastId',null,
    'title',merchant,
    'estimatedDate',estimated_date,
    'estimatedAmount',round(-amount,2),
    'category',null,
    'subcategory',null,
    'counterparty',merchant,
    'source','document',
    'frequency','once',
    'confidence',confidence,
    'status',case when estimated_date<current_date-tolerance_days then 'late' else 'expected' end,
    'toleranceDays',tolerance_days,
    'explanation',jsonb_build_object(
      'source','pending_invoice_document',
      'reason','Factura recibida sin cargo bancario asociado',
      'dateBasis',date_basis,
      'documentDate',document_date,
      'documentId',document_id,
      'automaticLink',false
    ),
    'actual',null,
    'match',null,
    'dismissedAt',null
  ) order by estimated_date,merchant,event_id),'[]'::jsonb)
  into v_invoice_all
  from eligible;

  select coalesce(jsonb_agg(x.item order by (x.item->>'estimatedDate')::date,x.ord),'[]'::jsonb)
  into v_invoice_visible
  from jsonb_array_elements(v_invoice_all) with ordinality x(item,ord)
  where not exists(
    select 1 from financial_app.forecast_event_overrides o
    where o.user_email=v_email and o.event_id=x.item->>'id' and o.action='dismissed'
  );

  select coalesce(jsonb_agg(x.item||jsonb_build_object('dismissedAt',o.created_at) order by (x.item->>'estimatedDate')::date,x.ord),'[]'::jsonb)
  into v_invoice_dismissed
  from jsonb_array_elements(v_invoice_all) with ordinality x(item,ord)
  join financial_app.forecast_event_overrides o
    on o.user_email=v_email and o.event_id=x.item->>'id' and o.action='dismissed';

  v_events:=coalesce(v_base->'events','[]'::jsonb)||v_invoice_visible;
  v_dismissed:=coalesce(v_base->'dismissedEvents','[]'::jsonb)||v_invoice_dismissed;

  with months as(
    select generate_series(date_trunc('month',v_start),date_trunc('month',v_end),interval '1 month')::date month_start
  ),actual as(
    select to_date(a.item->>'month','YYYY-MM') month_start,
      coalesce((a.item->>'income')::numeric,0) income,
      coalesce((a.item->>'expenses')::numeric,0) expenses,
      coalesce((a.item->>'cashFlow')::numeric,0) cash_flow,
      coalesce((a.item->>'movements')::int,0) movements
    from jsonb_array_elements(coalesce(v_base->'actualMonths','[]'::jsonb)) a(item)
  ),event_rows as(
    select (e.item->>'estimatedDate')::date estimated_date,
      (e.item->>'estimatedAmount')::numeric estimated_amount,
      e.item->>'status' status
    from jsonb_array_elements(v_events) e(item)
  ),pending as(
    select date_trunc('month',estimated_date)::date month_start,
      coalesce(sum(estimated_amount) filter(where estimated_amount>0 and status<>'received'),0)::numeric income,
      coalesce(abs(sum(estimated_amount) filter(where estimated_amount<0 and status<>'received')),0)::numeric expenses,
      coalesce(sum(estimated_amount) filter(where status<>'received'),0)::numeric cash_flow,
      count(*) filter(where status<>'received')::int events
    from event_rows
    group by date_trunc('month',estimated_date)::date
  ),received as(
    select date_trunc('month',estimated_date)::date month_start,count(*)::int events
    from event_rows where status='received'
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

  select count(*)::int,
    count(*) filter(where e.item->>'status'='expected')::int,
    count(*) filter(where e.item->>'status'='received')::int,
    count(*) filter(where e.item->>'status'='late')::int
  into v_total,v_expected,v_received,v_late
  from jsonb_array_elements(v_events) e(item);

  select count(*)::int into v_dismissed_count
  from jsonb_array_elements(v_dismissed) e(item);

  return v_base||jsonb_build_object(
    'events',v_events,
    'dismissedEvents',v_dismissed,
    'projectionMonths',v_projection_months,
    'counts',jsonb_build_object(
      'total',v_total,
      'expected',v_expected,
      'received',v_received,
      'late',v_late,
      'dismissed',v_dismissed_count
    ),
    'rules',coalesce(v_base->'rules','{}'::jsonb)||jsonb_build_object(
      'pendingInvoiceCommitments',true,
      'pendingInvoiceLookbackDays',45,
      'pendingInvoiceFallbackDays',7,
      'pendingInvoiceRequiresNoMovementCandidate',true,
      'pendingInvoiceDeduplicatesCanonicalForecast',true,
      'pendingInvoiceDismissible',true,
      'sourceDataReadOnly',true
    )
  );
end
$$;

revoke all on function financial_app.forecast_calendar_document_commitments_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_calendar_document_commitments_core(date,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_calendar(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path='pg_catalog','financial_app'
as $$
  select financial_app.forecast_calendar_document_commitments_core(p_start,p_months)
$$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role;

-- 7.0 sigue siendo el único cálculo de liquidez. Solo cambia su fuente de eventos:
-- consume el calendario canónico enriquecido con evidencia documental 9.0.
create or replace function financial_app.forecast_liquidity_core(
  p_start date default current_date,
  p_days integer default 90
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
  v_calendar:=financial_app.forecast_calendar_document_commitments_core(v_start,v_months);

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
    select e.item,e.ord::bigint ord,
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
    from event_rows group by effective_date
  ),projection_days as(
    select gs::date projection_date from generate_series(v_start,v_end,interval '1 day') gs
  ),series as(
    select d.projection_date,
      round(coalesce(e.income,0),2) income,
      round(coalesce(e.expenses,0),2) expenses,
      round(coalesce(e.net,0),2) net,
      coalesce(e.event_count,0)::int event_count,
      coalesce(e.uncertain_count,0)::int uncertain_count,
      round(v_opening+sum(coalesce(e.net,0)) over(order by d.projection_date rows between unbounded preceding and current row),2) projected_balance
    from projection_days d left join daily_events e on e.effective_date=d.projection_date
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'date',projection_date,'income',income,'expenses',expenses,'net',net,
      'eventCount',event_count,'uncertainEvents',uncertain_count,'projectedBalance',projected_balance
    ) order by projection_date),'[]'::jsonb),
    jsonb_build_object(
      'openingBalance',round(v_opening,2),
      'projectedEndBalance',coalesce((select projected_balance from series order by projection_date desc limit 1),round(v_opening,2)),
      'minimumProjectedBalance',coalesce((select projected_balance from series order by projected_balance,projection_date limit 1),round(v_opening,2)),
      'minimumBalanceDate',(select projection_date from series order by projected_balance,projection_date limit 1),
      'daysBelowZero',(select count(*)::int from series where projected_balance<0),
      'pendingIncome',round(coalesce((select sum(amount) from event_rows where amount>0),0),2),
      'pendingExpenses',round(coalesce(abs((select sum(amount) from event_rows where amount<0)),0),2),
      'pendingNet',round(coalesce((select sum(amount) from event_rows),0),2),
      'pendingEvents',(select count(*)::int from event_rows),
      'overdueEvents',(select count(*)::int from event_rows where estimated_date<v_start)
    ),
    jsonb_build_object(
      '30',case when v_days>=30 then (select projected_balance from series where projection_date<=v_start+29 order by projection_date desc limit 1) else null end,
      '60',case when v_days>=60 then (select projected_balance from series where projection_date<=v_start+59 order by projection_date desc limit 1) else null end,
      '90',case when v_days>=90 then (select projected_balance from series where projection_date<=v_start+89 order by projection_date desc limit 1) else null end
    ),
    jsonb_build_object(
      'high',(select count(*)::int from event_rows where confidence>=.80),
      'medium',(select count(*)::int from event_rows where confidence>=.65 and confidence<.80),
      'low',(select count(*)::int from event_rows where confidence<.65)
    )
  into v_daily,v_summary,v_horizons,v_confidence
  from series;

  with event_rows as(
    select e.item,e.ord::bigint ord,
      (e.item->>'estimatedDate')::date estimated_date,
      greatest((e.item->>'estimatedDate')::date,v_start) effective_date,
      (e.item->>'estimatedAmount')::numeric amount,
      greatest(0::numeric,least(1::numeric,coalesce((e.item->>'confidence')::numeric,0))) confidence
    from jsonb_array_elements(coalesce(v_calendar->'events','[]'::jsonb)) with ordinality e(item,ord)
    where coalesce(e.item->>'status','expected')<>'received'
      and (e.item->>'estimatedDate')::date<=v_end
  ),daily_balance as(
    select (d.item->>'date')::date projection_date,(d.item->>'projectedBalance')::numeric projected_balance
    from jsonb_array_elements(v_daily) d(item)
  ),ranked as(
    select e.*,row_number() over(order by e.effective_date,abs(e.amount) desc,e.ord) rn
    from event_rows e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
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
  ) order by r.rn) filter(where r.rn<=12),'[]'::jsonb)
  into v_commitments
  from ranked r left join daily_balance b on b.projection_date=r.effective_date;

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
      'pendingInvoiceCommitments',true,
      'maximumDays',180
    )
  );
end
$$;

revoke all on function financial_app.forecast_liquidity_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_liquidity_core(date,integer) to authenticated,service_role;

-- El wrapper público de liquidez no cambia: sigue invocando el único core canónico.
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