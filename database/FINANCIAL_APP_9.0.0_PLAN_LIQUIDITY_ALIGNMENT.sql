-- Financial App 9.0.0
-- Alinea Plan con el motor canónico de previsión de liquidez.
-- Mantiene intacto el contrato JSON público de financial_app_plan_overview.

begin;

create or replace function financial_app.plan_overview_core(p_month date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text := financial_app.authorized_email();
  v_month date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_budget jsonb;
  v_forecast jsonb;
  v_goals jsonb;
  v_net_worth jsonb;
  v_control jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_status text := 'stable';
  v_critical int := 0;
  v_high int := 0;
  v_medium int := 0;
  v_first_negative date;
  v_budget_projection numeric;
  v_capacity numeric := 0;
  v_goal_required numeric := 0;
  v_capacity_after_goals numeric := 0;
  v_duplicates int := 0;
  v_needs_review int := 0;
  v_close_warnings int := 0;
  v_over_budget int := 0;
  v_unbudgeted numeric := 0;
  v_lowest_balance numeric := 0;
  v_projected_net numeric := 0;
  v_goal_attention int := 0;
  v_goal_overdue int := 0;
  v_goal_source_missing int := 0;
  v_coverage_complete boolean := true;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_budget := financial_app.budget_overview_core(v_month);
  v_forecast := financial_app.forecast_liquidity_core(current_date,90);
  v_goals := financial_app.goals_overview_core();
  v_net_worth := financial_app.net_worth_overview_core(18);
  v_control := financial_app.control_center_core(v_month);

  v_budget_projection := nullif(v_budget #>> '{projection,projectedDifference}','')::numeric;
  v_capacity := coalesce(nullif(v_goals->>'capacityReference','')::numeric,0);
  v_goal_required := coalesce(nullif(v_goals #>> '{summary,monthlyRequired}','')::numeric,0);
  v_capacity_after_goals := round(v_capacity-v_goal_required,2);
  v_duplicates := coalesce(nullif(v_control #>> '{snapshot,duplicates}','')::int,0);
  v_needs_review := coalesce(nullif(v_control #>> '{snapshot,needsReview}','')::int,0);
  v_close_warnings := coalesce(nullif(v_control #>> '{snapshot,closeWarnings}','')::int,0);
  v_over_budget := coalesce(nullif(v_budget->>'overBudgetCount','')::int,0);
  v_unbudgeted := coalesce(nullif(v_budget->>'unbudgetedSpent','')::numeric,0);
  v_lowest_balance := coalesce(nullif(v_forecast #>> '{summary,minimumProjectedBalance}','')::numeric,0);
  v_projected_net := coalesce(nullif(v_forecast #>> '{summary,pendingNet}','')::numeric,0);
  v_goal_attention := coalesce(nullif(v_goals #>> '{summary,attentionCount}','')::int,0);
  v_goal_overdue := coalesce(nullif(v_goals #>> '{summary,overdueCount}','')::int,0);
  v_goal_source_missing := coalesce(nullif(v_goals #>> '{summary,sourceMissingCount}','')::int,0);
  v_coverage_complete := coalesce((v_net_worth #>> '{coverage,currentComplete}')::boolean,false);

  select (x->>'date')::date into v_first_negative
  from jsonb_array_elements(coalesce(v_forecast->'daily','[]'::jsonb)) x
  where coalesce(nullif(x->>'projectedBalance','')::numeric,0) < 0
  order by (x->>'date')::date
  limit 1;

  if v_duplicates>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','duplicates','severity','critical','domain','control','title','Revisar posibles duplicados','detail',v_duplicates||' movimiento(s) pueden estar duplicados y afectar a cualquier cálculo.','href','/movimientos?duplicate=1','value',v_duplicates,'unit','movements','sourcePath','control.snapshot.duplicates'));
  end if;
  if v_lowest_balance<0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','negative-balance','severity','critical','domain','forecast','title','Evitar saldo negativo en la previsión','detail','El saldo mínimo confirmado a 90 días es '||to_char(v_lowest_balance,'FM999G999G990D00')||' €'||case when v_first_negative is null then '.' else ' y el primer saldo negativo aparece el '||to_char(v_first_negative,'DD/MM/YYYY')||'.' end,'href','/prevision','value',round(v_lowest_balance,2),'unit','EUR','date',v_first_negative,'sourcePath','forecast.lowestBalance'));
  end if;
  if v_needs_review>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','needs-review','severity','high','domain','control','title','Completar revisión de movimientos','detail',v_needs_review||' movimiento(s) necesitan revisión antes de confiar plenamente en el periodo.','href','/movimientos?review=1','value',v_needs_review,'unit','movements','sourcePath','control.snapshot.needsReview'));
  end if;
  if v_budget_projection is not null and v_budget_projection<0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','budget-projection','severity','high','domain','budget','title','Corregir la proyección de presupuesto','detail','Al ritmo actual el mes terminaría '||to_char(abs(v_budget_projection),'FM999G999G990D00')||' € por encima del presupuesto disponible.','href','/presupuesto','value',round(v_budget_projection,2),'unit','EUR','sourcePath','budget.projection.projectedDifference'));
  end if;
  if v_goal_overdue>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','goals-overdue','severity','high','domain','goals','title','Replanificar objetivos vencidos','detail',v_goal_overdue||' objetivo(s) tienen una fecha objetivo ya vencida.','href','/objetivos','value',v_goal_overdue,'unit','goals','sourcePath','goals.summary.overdueCount'));
  end if;
  if v_goal_source_missing>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','goals-source-missing','severity','high','domain','goals','title','Reparar objetivos sin fuente','detail',v_goal_source_missing||' objetivo(s) dependen de una cuenta cuyo saldo no está disponible.','href','/objetivos','value',v_goal_source_missing,'unit','goals','sourcePath','goals.summary.sourceMissingCount'));
  end if;
  if v_capacity_after_goals<0 and v_goal_required>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','goal-capacity','severity','medium','domain','goals','title','Ajustar el ritmo conjunto de objetivos','detail','La aportación mensual requerida por todos los objetivos supera en '||to_char(abs(v_capacity_after_goals),'FM999G999G990D00')||' € la capacidad de referencia calculada con tres meses completos.','href','/objetivos','value',round(v_capacity_after_goals,2),'unit','EUR/month','sourcePath','summary.capacityAfterGoals'));
  elsif v_goal_attention>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','goals-attention','severity','medium','domain','goals','title','Revisar objetivos exigentes','detail',v_goal_attention||' objetivo(s) requieren atención según su fecha, saldo y capacidad mensual.','href','/objetivos','value',v_goal_attention,'unit','goals','sourcePath','goals.summary.attentionCount'));
  end if;
  if v_unbudgeted>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','unbudgeted','severity','medium','domain','budget','title','Asignar gasto sin presupuesto','detail','Hay '||to_char(v_unbudgeted,'FM999G999G990D00')||' € de gasto real sin presupuesto asignado.','href','/presupuesto','value',round(v_unbudgeted,2),'unit','EUR','sourcePath','budget.unbudgetedSpent'));
  elsif v_over_budget>0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','over-budget','severity','medium','domain','budget','title','Revisar presupuestos excedidos','detail',v_over_budget||' presupuesto(s) han superado el disponible del mes.','href','/presupuesto','value',v_over_budget,'unit','budgets','sourcePath','budget.overBudgetCount'));
  end if;
  if not v_coverage_complete then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','net-worth-coverage','severity','medium','domain','netWorth','title','Completar cobertura de patrimonio','detail','No todas las cuentas activas tienen un saldo conocido para el patrimonio actual.','href','/patrimonio','value',coalesce(nullif(v_net_worth #>> '{coverage,knownAccounts}','')::int,0),'unit','knownAccounts','sourcePath','netWorth.coverage.currentComplete'));
  end if;
  if v_projected_net<0 and v_lowest_balance>=0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','forecast-net','severity','medium','domain','forecast','title','Vigilar el flujo previsto a 90 días','detail','Las previsiones confirmadas suman un flujo neto de '||to_char(v_projected_net,'FM999G999G990D00')||' € en 90 días.','href','/prevision','value',round(v_projected_net,2),'unit','EUR','sourcePath','forecast.projectedNet'));
  end if;
  if v_close_warnings>0 and v_duplicates=0 and v_needs_review=0 then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('key','close-warnings','severity','low','domain','control','title','Resolver avisos antes del cierre mensual','detail',v_close_warnings||' aviso(s) no bloqueantes siguen abiertos en el Centro de Control.','href','/control?month='||to_char(v_month,'YYYY-MM'),'value',v_close_warnings,'unit','warnings','sourcePath','control.snapshot.closeWarnings'));
  end if;

  select count(*) filter(where x->>'severity'='critical'),count(*) filter(where x->>'severity'='high'),count(*) filter(where x->>'severity'='medium')
  into v_critical,v_high,v_medium from jsonb_array_elements(v_actions) x;
  v_status := case when v_critical>0 then 'critical' when v_high>0 or v_medium>0 then 'attention' else 'stable' end;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),'asOf',current_date,'month',to_char(v_month,'YYYY-MM'),'status',v_status,
    'summary',jsonb_build_object(
      'monthlyIncome',coalesce(nullif(v_control #>> '{snapshot,income}','')::numeric,0),'monthlyExpenses',coalesce(nullif(v_control #>> '{snapshot,expenses}','')::numeric,0),'monthlyNet',coalesce(nullif(v_control #>> '{snapshot,net}','')::numeric,0),
      'budgetAssigned',coalesce(nullif(v_budget->>'assigned','')::numeric,0),'budgetSpent',coalesce(nullif(v_budget->>'spent','')::numeric,0),'budgetAvailable',coalesce(nullif(v_budget->>'available','')::numeric,0),'budgetProjectedDifference',v_budget_projection,
      'forecastCurrentBalance',coalesce(nullif(v_forecast #>> '{summary,openingBalance}','')::numeric,0),'forecastProjectedBalance90',coalesce(nullif(v_forecast #>> '{summary,projectedEndBalance}','')::numeric,0),'forecastLowestBalance90',v_lowest_balance,'forecastProjectedNet90',v_projected_net,
      'netWorth',coalesce(nullif(v_net_worth->>'netWorth','')::numeric,0),'projectedNetWorth90',coalesce(nullif(v_net_worth->>'projectedNetWorth90','')::numeric,0),'goalMonthlyRequired',v_goal_required,'goalCapacityReference',v_capacity,'capacityAfterGoals',v_capacity_after_goals),
    'domains',jsonb_build_object(
      'budget',jsonb_build_object('assigned',v_budget->'assigned','spent',v_budget->'spent','available',v_budget->'available','overBudgetCount',v_budget->'overBudgetCount','unbudgetedSpent',v_budget->'unbudgetedSpent','projection',v_budget->'projection','href','/presupuesto'),
      'forecast',jsonb_build_object('currentBalance',v_forecast #> '{summary,openingBalance}','projectedBalance',v_forecast #> '{summary,projectedEndBalance}','projectedNet',v_forecast #> '{summary,pendingNet}','lowestBalance',v_forecast #> '{summary,minimumProjectedBalance}','firstNegativeDate',v_first_negative,'eventCount',coalesce(nullif(v_forecast #>> '{summary,pendingEvents}','')::int,0),'suggestionCount',0,'href','/prevision'),
      'goals',jsonb_build_object('capacityReference',v_goals->'capacityReference','capacityReferenceMethod',v_goals->'capacityReferenceMethod','summary',v_goals->'summary','href','/objetivos'),
      'netWorth',jsonb_build_object('assets',v_net_worth->'assets','liabilities',v_net_worth->'liabilities','netWorth',v_net_worth->'netWorth','projectedNetWorth90',v_net_worth->'projectedNetWorth90','forecastImpact90',v_net_worth->'forecastImpact90','coverage',v_net_worth->'coverage','href','/patrimonio'),
      'control',jsonb_build_object('snapshot',v_control->'snapshot','visibleAlertCount',jsonb_array_length(coalesce(v_control->'alerts','[]'::jsonb)),'hiddenAlertCount',v_control->'hiddenAlertCount','href','/control?month='||to_char(v_month,'YYYY-MM'))),
    'actions',v_actions,'actionSummary',jsonb_build_object('total',jsonb_array_length(v_actions),'critical',v_critical,'high',v_high,'medium',v_medium),
    'rules',jsonb_build_object('readOnlyDecisionLayer',true,'noAutomaticFinancialMutations',true,'forecastDays',90,'forecastSuggestionsAffectProjection',false,'goalCapacityMethod',v_goals->'capacityReferenceMethod','sourceFunctions',jsonb_build_array('budget_overview_core','forecast_liquidity_core','goals_overview_core','net_worth_overview_core','control_center_core'))
  );
end;
$$;

revoke all on function financial_app.plan_overview_core(date) from public, anon;
grant execute on function financial_app.plan_overview_core(date) to authenticated, service_role;

commit;
