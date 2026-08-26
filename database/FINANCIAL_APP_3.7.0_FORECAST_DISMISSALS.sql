-- Financial App 3.7.0 — forecast occurrence dismissals.
-- A dismissed occurrence is hidden from Previsión and excluded from its monthly metrics.
-- Dismissing never alters a real banking transaction or destroys the recurring pattern.

create table if not exists financial_app.forecast_event_overrides(
  user_email text not null,
  event_id text not null,
  pattern_id text,
  estimated_date date not null,
  title text,
  action text not null default 'dismissed' check(action='dismissed'),
  created_at timestamptz not null default now(),
  primary key(user_email,event_id)
);

revoke all on table financial_app.forecast_event_overrides from public,anon,authenticated;
grant all on table financial_app.forecast_event_overrides to service_role;

create or replace function financial_app.dismiss_forecast_event(
  p_event_id text,
  p_pattern_id text default null,
  p_estimated_date date default null,
  p_title text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_event_id,'')),'') is null or p_estimated_date is null then
    raise exception 'invalid forecast event';
  end if;
  insert into financial_app.forecast_event_overrides(user_email,event_id,pattern_id,estimated_date,title,action)
  values(v_email,trim(p_event_id),nullif(trim(coalesce(p_pattern_id,'')),''),p_estimated_date,nullif(trim(coalesce(p_title,'')),''),'dismissed')
  on conflict(user_email,event_id) do update set
    pattern_id=excluded.pattern_id,
    estimated_date=excluded.estimated_date,
    title=excluded.title,
    action='dismissed',
    created_at=now();
  return true;
end;$function$;

revoke all on function financial_app.dismiss_forecast_event(text,text,date,text) from public,anon;
grant execute on function financial_app.dismiss_forecast_event(text,text,date,text) to authenticated,service_role;

create or replace function public.financial_app_dismiss_forecast_event(
  p_event_id text,
  p_pattern_id text default null,
  p_estimated_date date default null,
  p_title text default null
)
returns boolean
language sql
volatile
set search_path to 'pg_catalog','financial_app'
as $function$
  select financial_app.dismiss_forecast_event(p_event_id,p_pattern_id,p_estimated_date,p_title)
$function$;

revoke all on function public.financial_app_dismiss_forecast_event(text,text,date,text) from public,anon;
grant execute on function public.financial_app_dismiss_forecast_event(text,text,date,text) to authenticated,service_role;

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
with base as(
  select financial_app.forecast_calendar_core(p_start,p_months) payload,
         financial_app.authorized_email() user_email
), filtered as(
  select b.payload,b.user_email,
    coalesce(jsonb_agg(e.item order by e.ord) filter(where e.item is not null),'[]'::jsonb) events
  from base b
  left join lateral(
    select x.item,x.ord
    from jsonb_array_elements(coalesce(b.payload->'events','[]'::jsonb)) with ordinality x(item,ord)
    where not exists(
      select 1 from financial_app.forecast_event_overrides o
      where o.user_email=b.user_email and o.event_id=x.item->>'id' and o.action='dismissed'
    )
  ) e on true
  group by b.payload,b.user_email
), counts as(
  select f.payload,f.events,
    count(*) filter(where ev.item is not null)::int total,
    count(*) filter(where ev.item->>'status'='expected')::int expected,
    count(*) filter(where ev.item->>'status'='received')::int received,
    count(*) filter(where ev.item->>'status'='late')::int late
  from filtered f
  left join lateral jsonb_array_elements(f.events) ev(item) on true
  group by f.payload,f.events
)
select payload || jsonb_build_object(
  'events',events,
  'counts',jsonb_build_object('total',total,'expected',expected,'received',received,'late',late),
  'rules',coalesce(payload->'rules','{}'::jsonb)||jsonb_build_object('dismissibleOccurrences',true,'dismissedEventsExcludedFromMetrics',true)
)
from counts
$function$;

revoke all on function public.financial_app_forecast_calendar(date,integer) from public,anon;
grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role;
