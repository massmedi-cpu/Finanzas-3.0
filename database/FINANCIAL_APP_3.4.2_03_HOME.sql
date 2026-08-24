begin;

create or replace function financial_app.home_overview_core()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_dashboard jsonb;v_accounts jsonb;v_budget jsonb;v_forecast jsonb;v_analysis jsonb;
  v_reconciliation_summary jsonb;v_control_snapshot jsonb;v_alert_bundle jsonb;
  v_month date;v_year int;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  v_month:=date_trunc('month',current_date)::date;
  v_year:=extract(year from current_date)::int;

  v_dashboard:=financial_app.dashboard_rpc(v_month);
  v_accounts:=financial_app.accounts_core();
  v_budget:=financial_app.budget_month_core(v_month);
  v_forecast:=financial_app.forecast_overview_core(current_date,30);
  v_analysis:=financial_app.analysis_overview_core(v_year);
  v_reconciliation_summary:=financial_app.reconciliation_summary_core();
  v_control_snapshot:=financial_app.control_month_snapshot_metrics_core(
    v_month,
    jsonb_build_object('income',v_dashboard->'income','expenses',v_dashboard->'expenses','net',v_dashboard->'cashFlow'),
    v_budget
  );
  v_alert_bundle:=financial_app.control_alert_bundle_core(v_month,v_control_snapshot);

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'dashboard',v_dashboard,'accounts',v_accounts,'budget',v_budget,'forecast',v_forecast,'analysis',v_analysis,
    'reconciliation',jsonb_build_object('version',financial_app.current_app_version(),'summary',v_reconciliation_summary),
    'controlSummary',jsonb_build_object(
      'visibleAlerts',coalesce(jsonb_array_length(v_alert_bundle->'alerts'),0),
      'hiddenAlerts',coalesce((v_alert_bundle->>'hiddenAlertCount')::int,0),
      'closeReady',coalesce((v_control_snapshot->>'closeReady')::boolean,false),
      'closeBlockers',coalesce((v_control_snapshot->>'closeBlockers')::int,0),
      'closeWarnings',coalesce((v_control_snapshot->>'closeWarnings')::int,0)
    )
  );
end
$function$;

insert into financial_app.app_meta(key,value,updated_at)
values ('app_version',to_jsonb('3.4.2'::text),now()),('target_version',to_jsonb('3.4.2'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
