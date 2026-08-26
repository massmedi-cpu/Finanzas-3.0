-- Financial App 3.7.1 — restore authenticated forecast reads after 3.7 dismissals.
-- Keep override rows private: the authenticated caller executes a security-definer core
-- which resolves the authorized email and filters only that user's dismissed occurrences.

create or replace function financial_app.forecast_calendar_visible_core(
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
  v_email text;
  v_payload jsonb;
  v_events jsonb;
  v_total integer:=0;
  v_expected integer:=0;
  v_received integer:=0;
  v_late integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_payload:=financial_app.forecast_calendar_core(p_start,p_months);

  select coalesce(jsonb_agg(x.item order by x.ord),'[]'::jsonb)
  into v_events
  from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) with ordinality x(item,ord)
  where not exists(
    select 1
    from financial_app.forecast_event_overrides o
    where o.user_email=v_email
      and o.event_id=x.item->>'id'
      and o.action='dismissed'
  );

  select
    count(*)::int,
    count(*) filter(where e.item->>'status'='expected')::int,
    count(*) filter(where e.item->>'status'='received')::int,
    count(*) filter(where e.item->>'status'='late')::int
  into v_total,v_expected,v_received,v_late
  from jsonb_array_elements(coalesce(v_events,'[]'::jsonb)) e(item);

  return v_payload || jsonb_build_object(
    'events',coalesce(v_events,'[]'::jsonb),
    'counts',jsonb_build_object('total',v_total,'expected',v_expected,'received',v_received,'late',v_late),
    'rules',coalesce(v_payload->'rules','{}'::jsonb)||jsonb_build_object(
      'dismissibleOccurrences',true,
      'dismissedEventsExcludedFromMetrics',true
    )
  );
end;$function$;

revoke all on function financial_app.forecast_calendar_visible_core(date,integer) from public,anon;
grant execute on function financial_app.forecast_calendar_visible_core(date,integer) to authenticated,service_role;

create or replace function public.financial_app_forecast_calendar(
  p_start date default current_date,
  p_months integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','financial_app'
as $function$
  select financial_app.forecast_calendar_visible_core(p_start,p_months)
$function$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role;
