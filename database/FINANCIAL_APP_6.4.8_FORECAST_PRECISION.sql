begin;

-- Financial App 6.4.8 · precisión de señales anuales de Previsión.
--
-- Evidencia medida: una compra Bizum puntual al Ayuntamiento, clasificada como
-- "Impuestos y tasas", se convertía en una previsión anual solo por la categoría.
-- Conservamos el motor, el matching 1↔1, los descartes y el ledger existentes.
-- Únicamente endurecemos la admisión del suplemento histórico anual:
--   1) seguros explícitos pueden proyectarse desde una observación;
--   2) títulos con señal fiscal/seguro explícita pueden proyectarse desde una observación;
--   3) categorías fiscales genéricas necesitan la misma identidad en >=2 años.

create or replace function financial_app.forecast_calendar_visible_core(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_payload jsonb;
  v_all_events jsonb:='[]'::jsonb;
  v_events jsonb:='[]'::jsonb;
  v_dismissed jsonb:='[]'::jsonb;
  v_actual_months jsonb:='[]'::jsonb;
  v_projection_months jsonb:='[]'::jsonb;
  v_start date;
  v_end date;
  v_total integer:=0;
  v_expected integer:=0;
  v_received integer:=0;
  v_late integer:=0;
  v_dismissed_count integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_payload:=financial_app.forecast_calendar_core(p_start,p_months);
  v_start:=(v_payload->>'startDate')::date;
  v_end:=(v_payload->>'endDate')::date;

  with base_events as(
    select x.item,x.ord::bigint ord
    from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) with ordinality x(item,ord)
  ),historic as(
    select t.id transaction_id,
      coalesce(t.effective_date,t.source_date) d,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount,
      coalesce(t.category_override,t.source_category) category,
      coalesce(t.subcategory_override,t.source_subcategory) subcategory,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) title,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,'')) counterparty,
      financial_app.forecast_norm(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))) key_norm
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.personal_amount_override,t.source_amount)<=-5
      and coalesce(t.effective_date,t.source_date)>=v_start-1460
      and coalesce(t.effective_date,t.source_date)<=current_date
      and financial_app.forecast_is_annual_signal(
        coalesce(t.category_override,t.source_category),
        coalesce(t.subcategory_override,t.source_subcategory),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )
  ),annual_candidates as(
    select h.*,(h.d+interval '1 year')::date target_date
    from historic h
    where (h.d+interval '1 year')::date between v_start and v_end
      and(
        lower(coalesce(h.category,'')||' '||coalesce(h.subcategory,'')) ~ '(seguros|seguro)'
        or lower(coalesce(h.title,'')) ~ '(seguro|línea directa|linea directa|domiciliacion impuesto|domiciliación impuesto|impuesto|irpf|\mibi\M|\mivtm\M|tributo|tasa municipal)'
        or(
          h.key_norm<>''
          and exists(
            select 1
            from historic prior
            where prior.key_norm=h.key_norm
              and extract(year from prior.d)<>extract(year from h.d)
          )
        )
      )
  ),supplemental as(
    select jsonb_build_object(
      'id','annual-history:'||h.transaction_id::text||':'||h.target_date::text,
      'patternId',md5('annual-history:'||h.transaction_id::text),
      'forecastId',null,
      'title',h.title,
      'estimatedDate',h.target_date,
      'estimatedAmount',round(h.amount,2),
      'category',h.category,
      'subcategory',h.subcategory,
      'counterparty',h.counterparty,
      'source','automatic',
      'frequency','yearly',
      'confidence',.72,
      'status',case when h.target_date<current_date-35 then 'late' else 'expected' end,
      'toleranceDays',35,
      'explanation',jsonb_build_object('source','annual_tax_insurance_history','reason','Seguro o impuesto detectado por historial anual','observations',1),
      'actual',null
    ) item,
    1000000::bigint+row_number() over(order by h.target_date,h.transaction_id) ord
    from annual_candidates h
    where not exists(
      select 1 from base_events b
      where abs((b.item->>'estimatedDate')::date-h.target_date)<=35
        and sign((b.item->>'estimatedAmount')::numeric)=sign(h.amount)
        and abs((b.item->>'estimatedAmount')::numeric-h.amount)<=greatest(5::numeric,abs(h.amount)*.75)
        and(
          (h.key_norm<>'' and(
            financial_app.forecast_norm(b.item->>'counterparty')=h.key_norm
            or financial_app.forecast_norm(b.item->>'title')=h.key_norm
          ))
          or(
            financial_app.forecast_norm(b.item->>'category')=financial_app.forecast_norm(h.category)
            and financial_app.forecast_norm(b.item->>'subcategory')=financial_app.forecast_norm(h.subcategory)
          )
        )
    )
  ),all_events as(
    select item,ord from base_events
    union all
    select item,ord from supplemental
  )
  select coalesce(jsonb_agg(item order by ord),'[]'::jsonb)
  into v_all_events
  from all_events;

  select coalesce(jsonb_agg(x.item||jsonb_build_object('dismissedAt',o.created_at) order by (x.item->>'estimatedDate')::date,x.ord),'[]'::jsonb)
  into v_dismissed
  from jsonb_array_elements(v_all_events) with ordinality x(item,ord)
  join financial_app.forecast_event_overrides o
    on o.user_email=v_email and o.event_id=x.item->>'id' and o.action='dismissed';

  with visible as(
    select x.ord::bigint ord,
      jsonb_set(
        jsonb_set(
          jsonb_set(x.item,'{status}',to_jsonb(case
            when (x.item->>'estimatedDate')::date<current_date-greatest(0,coalesce((x.item->>'toleranceDays')::int,0)) then 'late'::text
            else 'expected'::text end),true),
          '{actual}','null'::jsonb,true
        ),
        '{match}','null'::jsonb,true
      ) item
    from jsonb_array_elements(v_all_events) with ordinality x(item,ord)
    where not exists(
      select 1 from financial_app.forecast_event_overrides o
      where o.user_email=v_email and o.event_id=x.item->>'id' and o.action='dismissed'
    )
  ),events as(
    select v.ord,v.item,
      (v.item->>'estimatedDate')::date estimated_date,
      (v.item->>'estimatedAmount')::numeric estimated_amount,
      greatest(0,coalesce((v.item->>'toleranceDays')::int,0)) tolerance_days,
      coalesce(v.item->>'source','automatic') source,
      financial_app.forecast_norm(coalesce(nullif(v.item->>'counterparty',''),nullif(v.item->>'title',''))) event_key,
      financial_app.forecast_norm(v.item->>'category') category_norm,
      financial_app.forecast_norm(v.item->>'subcategory') subcategory_norm,
      financial_app.forecast_is_annual_signal(v.item->>'category',v.item->>'subcategory',v.item->>'title')
        or coalesce(v.item->'explanation'->>'source','') in('previous_year_seasonal','annual_tax_insurance_history') annual_signal
    from visible v
  ),transaction_base as(
    select t.id transaction_id,t.source_id,
      coalesce(t.effective_date,t.source_date) actual_date,
      coalesce(t.personal_amount_override,t.source_amount)::numeric actual_amount,
      coalesce(nullif(t.description_override,''),nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')) actual_title,
      coalesce(t.category_override,t.source_category) actual_category,
      financial_app.forecast_norm(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))) tx_key,
      financial_app.forecast_norm(coalesce(t.category_override,t.source_category)) category_norm,
      financial_app.forecast_norm(coalesce(t.subcategory_override,t.source_subcategory)) subcategory_norm
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date)<=current_date
  ),candidate_base as(
    select e.ord,e.item,e.estimated_date,e.estimated_amount,e.tolerance_days,e.source,e.annual_signal,
      t.transaction_id,t.source_id,t.actual_date,t.actual_amount,t.actual_title,t.actual_category,
      abs(t.actual_date-e.estimated_date) date_distance,
      abs(t.actual_amount-e.estimated_amount) amount_distance,
      case
        when e.event_key<>'' and t.tx_key=e.event_key then 0
        when e.event_key<>'' and t.tx_key<>'' and(position(e.event_key in t.tx_key)>0 or position(t.tx_key in e.event_key)>0) then 1
        when e.category_norm<>'' and e.category_norm=t.category_norm and e.subcategory_norm<>'' and e.subcategory_norm=t.subcategory_norm then 2
        when e.annual_signal and e.category_norm<>'' and e.category_norm=t.category_norm then 3
        when e.source='manual' and e.category_norm<>'' and e.category_norm=t.category_norm then 4
        else 9 end identity_rank
    from events e
    join transaction_base t
      on t.actual_date between e.estimated_date-e.tolerance_days and e.estimated_date+e.tolerance_days
      and sign(t.actual_amount)=sign(e.estimated_amount)
      and abs(t.actual_amount-e.estimated_amount)<=greatest(
        case when e.annual_signal then 5::numeric else 3::numeric end,
        abs(e.estimated_amount)*case when e.annual_signal then .75 when e.source='manual' then .20 else .35 end
      )
    where(
      (e.event_key<>'' and t.tx_key<>'' and(t.tx_key=e.event_key or position(e.event_key in t.tx_key)>0 or position(t.tx_key in e.event_key)>0))
      or(e.category_norm<>'' and e.category_norm=t.category_norm and e.subcategory_norm<>'' and e.subcategory_norm=t.subcategory_norm)
      or(e.annual_signal and e.category_norm<>'' and e.category_norm=t.category_norm)
      or(e.source='manual' and e.category_norm<>'' and e.category_norm=t.category_norm)
    )
  ),ranked as(
    select c.*,
      row_number() over(partition by c.ord order by c.identity_rank,c.date_distance,c.amount_distance,c.source_id) event_rank,
      row_number() over(partition by c.transaction_id order by c.identity_rank,c.date_distance,c.amount_distance,c.estimated_date,c.ord) transaction_rank
    from candidate_base c
  ),matches as(
    select * from ranked where event_rank=1 and transaction_rank=1
  ),enriched as(
    select e.ord,
      case when m.transaction_id is null then e.item else
        jsonb_set(
          jsonb_set(
            jsonb_set(e.item,'{status}',to_jsonb('received'::text),true),
            '{actual}',jsonb_build_object(
              'transactionId',m.transaction_id,
              'date',m.actual_date,
              'amount',round(m.actual_amount,2),
              'title',m.actual_title,
              'category',m.actual_category
            ),true
          ),
          '{match}',jsonb_build_object(
            'method','automatic_one_to_one',
            'dateDifferenceDays',m.date_distance,
            'amountDifference',round(m.amount_distance,2),
            'identityRank',m.identity_rank
          ),true
        )
      end item
    from events e left join matches m on m.ord=e.ord
  )
  select coalesce(jsonb_agg(item order by ord),'[]'::jsonb)
  into v_events
  from enriched;

  with months as(
    select generate_series(date_trunc('month',v_start),date_trunc('month',v_end),interval '1 month')::date month_start
  ),eligible as(
    select date_trunc('month',coalesce(t.effective_date,t.source_date))::date month_start,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating' and a.cash_flow_enabled=true
      and t.cash_flow_override is distinct from false
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date) between v_start and least(v_end,current_date)
  ),actual as(
    select month_start,
      coalesce(sum(amount) filter(where amount>0),0)::numeric income,
      coalesce(abs(sum(amount) filter(where amount<0)),0)::numeric expenses,
      coalesce(sum(amount),0)::numeric cash_flow,
      count(*)::int movements
    from eligible group by month_start
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
    from event_rows group by date_trunc('month',estimated_date)::date
  ),received as(
    select date_trunc('month',estimated_date)::date month_start,count(*)::int events
    from event_rows where status='received' group by date_trunc('month',estimated_date)::date
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'month',to_char(m.month_start,'YYYY-MM'),
      'income',round(coalesce(a.income,0),2),
      'expenses',round(coalesce(a.expenses,0),2),
      'cashFlow',round(coalesce(a.cash_flow,0),2),
      'movements',coalesce(a.movements,0)
    ) order by m.month_start),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
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
  into v_actual_months,v_projection_months
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

  v_dismissed_count:=jsonb_array_length(v_dismissed);

  return v_payload||jsonb_build_object(
    'events',v_events,
    'dismissedEvents',v_dismissed,
    'actualMonths',v_actual_months,
    'projectionMonths',v_projection_months,
    'counts',jsonb_build_object(
      'total',v_total,'expected',v_expected,'received',v_received,'late',v_late,'dismissed',v_dismissed_count
    ),
    'rules',coalesce(v_payload->'rules','{}'::jsonb)||jsonb_build_object(
      'dismissibleOccurrences',true,
      'reversibleDismissal',true,
      'dismissedEventsExcludedFromMetrics',true,
      'normalizedCategoryFallbackMatching',true,
      'actualExpensesIncludedInProjection',true,
      'confirmedEventsNotDoubleCounted',true,
      'oneToOneActualMatching',true,
      'annualTextSignalDetection',true,
      'serverSideMonthlyProjection',true,
      'genericTaxNeedsRepeatedIdentity',true
    )
  );
end
$$;

revoke all on function financial_app.forecast_calendar_visible_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_calendar_visible_core(date,integer) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
