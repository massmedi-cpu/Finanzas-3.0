-- Financial App 2.0.0 maintenance hotfix
-- Read paths must never mutate forecast state.
--
-- Root cause fixed:
-- financial_app.forecast_overview_core() used to call
-- financial_app.forecast_refresh_core(v_end), which performs INSERT/UPDATE.
-- When Home called the overview from a STABLE/read-only RPC PostgreSQL raised:
--   cannot execute INSERT in a read-only transaction
--
-- Forecast create/update already refreshes occurrences from the explicit
-- mutation path, so removing refresh from GET/read views preserves CRUD while
-- restoring the read-only architecture invariant.

do $migration$
declare
  v_def text;
  v_new_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'financial_app'
    and p.proname = 'forecast_overview_core'
    and pg_get_function_identity_arguments(p.oid) = 'p_start date, p_days integer';

  if v_def is null then
    raise exception 'forecast_overview_core_not_found';
  end if;

  v_new_def := regexp_replace(
    v_def,
    E'\\n[[:space:]]*perform financial_app\\.forecast_refresh_core\\(v_end\\);',
    '',
    'g'
  );

  if v_new_def = v_def then
    raise exception 'forecast_refresh_call_not_found';
  end if;

  execute v_new_def;
end
$migration$;

alter function financial_app.forecast_overview_core(date, integer) stable;
alter function public.financial_app_forecast_overview(date, integer) stable;

comment on function financial_app.forecast_overview_core(date, integer) is
  'Read-only forecast overview. Occurrence generation/consolidation must run only from explicit mutation/sync paths, never from GET/read views.';
