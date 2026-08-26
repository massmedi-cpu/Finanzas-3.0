begin;

-- Financial App 3.9.1 — portada progresiva sin alterar cálculos financieros.
-- Expone únicamente dos resúmenes autenticados que Inicio necesita para evitar
-- descargar overviews completos de Conciliación y Control.

create or replace function public.financial_app_reconciliation_summary()
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app,auth
as $$
  select financial_app.reconciliation_summary_core()
$$;

revoke all on function public.financial_app_reconciliation_summary() from public,anon;
grant execute on function public.financial_app_reconciliation_summary() to authenticated,service_role;

create or replace function financial_app.control_summary_core(
  p_month date,
  p_cash_flow jsonb,
  p_budget jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;
  v_alert_bundle jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_cash_flow is null or p_budget is null then raise exception 'control_summary_inputs_required'; end if;

  v_snapshot:=financial_app.control_month_snapshot_metrics_core(v_month,p_cash_flow,p_budget);
  v_alert_bundle:=financial_app.control_alert_bundle_core(v_month,v_snapshot);

  return jsonb_build_object(
    'visibleAlerts',coalesce(jsonb_array_length(v_alert_bundle->'alerts'),0),
    'hiddenAlerts',coalesce((v_alert_bundle->>'hiddenAlertCount')::int,0),
    'closeReady',coalesce((v_snapshot->>'closeReady')::boolean,false),
    'closeBlockers',coalesce((v_snapshot->>'closeBlockers')::int,0),
    'closeWarnings',coalesce((v_snapshot->>'closeWarnings')::int,0)
  );
end
$$;

revoke all on function financial_app.control_summary_core(date,jsonb,jsonb) from public,anon;
grant execute on function financial_app.control_summary_core(date,jsonb,jsonb) to authenticated,service_role;

create or replace function public.financial_app_control_summary(
  p_month date,
  p_cash_flow jsonb,
  p_budget jsonb
)
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app
as $$
  select financial_app.control_summary_core(p_month,p_cash_flow,p_budget)
$$;

revoke all on function public.financial_app_control_summary(date,jsonb,jsonb) from public,anon;
grant execute on function public.financial_app_control_summary(date,jsonb,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
