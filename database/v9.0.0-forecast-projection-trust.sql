-- Financial App 9.0.0 · forecast projection trust consistency
-- Keep event list, received-state trust and monthly projection on the same canonical set.

create or replace function financial_app.forecast_match_is_trustworthy(p_event jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'financial_app'
as $function$
select case
  when coalesce(p_event->>'status','') <> 'received' then true
  when coalesce(p_event#>>'{match,method}','') <> 'automatic_one_to_one' then true
  when coalesce(p_event#>>'{match,identityRank}','') !~ '^\d+$' then false
  else (p_event#>>'{match,identityRank}')::integer <= 1
end;
$function$;

create or replace function financial_app.forecast_auto_event_is_reliable(p_event jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'financial_app'
as $function$
with normalized as (
  select
    lower(coalesce(p_event->>'source','')) as source,
    lower(coalesce(p_event->>'frequency','')) as frequency,
    coalesce((p_event->>'estimatedAmount')::numeric,0) as amount,
    translate(
      lower(concat_ws(' ',
        coalesce(p_event->>'category',''),
        coalesce(p_event->>'subcategory',''),
        coalesce(p_event->>'title',''),
        coalesce(p_event->>'counterparty','')
      )),
      'áéíóúüñ',
      'aeiouun'
    ) as descriptor,
    translate(
      lower(concat_ws(' ',
        coalesce(p_event->>'category',''),
        coalesce(p_event->>'subcategory','')
      )),
      'áéíóúüñ',
      'aeiouun'
    ) as metadata
)
select case
  when source <> 'automatic' then true
  -- Money-transfer mechanisms are not obligations, even if merchant/category text
  -- contains a tax or service word.
  when descriptor ~ '(transfer|bizum|entre mis cuentas|movimientos internos)' then false
  when frequency = 'yearly' then descriptor ~ '(seguro|impuesto|tribut|\mtasa\M|\mibi\M|\mirpf\M|\maeat\M|hacienda|agencia tributaria)'
  when amount > 0 then descriptor ~ '(nomina|salario|sueldo|pension)'
  else metadata ~ '(vivienda|alquiler|hipoteca|comunidad|\magua\M|electric|energia|\mgas\M|internet|fibra|telefon|telecom|seguro|impuesto|tribut|\mtasa\M|suscrip|\mcuota\M|servicio)'
end
from normalized;
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
  )
  select coalesce(jsonb_agg(p.trusted_item order by p.ord),'[]'::jsonb)
    into v_events
  from prepared p
  where financial_app.forecast_auto_event_is_reliable(p.trusted_item);

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
      'projectionRecomputedAfterPrecision', true
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

revoke all on function financial_app.forecast_match_is_trustworthy(jsonb) from public, anon;
grant execute on function financial_app.forecast_match_is_trustworthy(jsonb) to authenticated, service_role;

revoke all on function financial_app.forecast_auto_event_is_reliable(jsonb) from public, anon;
revoke all on function financial_app.forecast_calendar_precision_core(date,integer) from public, anon;
grant execute on function financial_app.forecast_auto_event_is_reliable(jsonb) to authenticated, service_role;
grant execute on function financial_app.forecast_calendar_precision_core(date,integer) to authenticated, service_role;