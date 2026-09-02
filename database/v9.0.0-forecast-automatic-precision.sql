-- Financial App 9.0.0 · automatic forecast precision boundary
-- Preserve manual schedules/document commitments while rejecting weak historical recurrences.

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
  -- Manual/user schedules and document commitments are authoritative inputs.
  when source <> 'automatic' then true

  -- Coincidental once-a-year purchases must never become obligations. Yearly
  -- history is trusted only when the event itself carries a tax/insurance signal.
  when frequency = 'yearly' then descriptor ~ '(seguro|impuesto|tribut|\mtasa\M|\mibi\M|\mirpf\M|\maeat\M|hacienda|agencia tributaria)'

  -- Positive automatic income is intentionally high precision. Temporary aid
  -- (for example unemployment benefits) is not projected indefinitely.
  when amount > 0 then descriptor ~ '(nomina|salario|sueldo|pension)'

  -- Transfers/Bizum are movements of money, not recurring household obligations.
  when descriptor ~ '(transfer|bizum|entre mis cuentas|movimientos internos)' then false

  -- Negative automatic events require a durable service/obligation signal in
  -- canonical category metadata, not merely a merchant name seen twice.
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
begin
  v_payload := financial_app.forecast_calendar_document_commitments_core(p_start,p_months);

  select coalesce(jsonb_agg(e.item order by e.ord), '[]'::jsonb)
    into v_events
  from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) with ordinality as e(item,ord)
  where financial_app.forecast_auto_event_is_reliable(e.item);

  select jsonb_build_object(
    'total', count(*),
    'expected', count(*) filter (where item->>'status'='expected'),
    'received', count(*) filter (where item->>'status'='received'),
    'late', count(*) filter (where item->>'status' in ('late','overdue')),
    'dismissed', coalesce((v_payload#>>'{counts,dismissed}')::integer,0)
  )
    into v_counts
  from jsonb_array_elements(v_events) as e(item);

  v_rules := coalesce(v_payload->'rules','{}'::jsonb) || jsonb_build_object(
    'automaticPrecision', jsonb_build_object(
      'enabled', true,
      'precisionOverRecall', true,
      'positiveIncomeRequiresStableType', true,
      'annualRequiresTaxOrInsurance', true,
      'transfersExcluded', true,
      'recurringExpensesRequireObligationMetadata', true
    )
  );

  return v_payload || jsonb_build_object(
    'events', v_events,
    'counts', v_counts,
    'rules', v_rules
  );
end;
$function$;

create or replace function public.financial_app_forecast_calendar(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'financial_app'
as $function$
  select financial_app.forecast_calendar_precision_core(p_start,p_months)
$function$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public, anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated, service_role;

-- The public wrapper is SECURITY INVOKER, matching the existing forecast chain.
-- Authenticated callers therefore need EXECUTE on the internal read-only helpers too.
revoke all on function financial_app.forecast_auto_event_is_reliable(jsonb) from public, anon;
revoke all on function financial_app.forecast_calendar_precision_core(date,integer) from public, anon;
grant execute on function financial_app.forecast_auto_event_is_reliable(jsonb) to authenticated, service_role;
grant execute on function financial_app.forecast_calendar_precision_core(date,integer) to authenticated, service_role;
