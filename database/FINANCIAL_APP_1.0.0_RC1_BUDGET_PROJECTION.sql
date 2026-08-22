-- Financial App 1.0.0-rc.1 · Presupuesto: proyección mensual y visión anual

create or replace function financial_app.budget_overview_core(p_month date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_next date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_year_start date:=date_trunc('year',coalesce(p_month,current_date))::date;
  v_year_end date:=(date_trunc('year',coalesce(p_month,current_date))+interval '1 year')::date;
  v_base jsonb;v_budgets jsonb:='[]'::jsonb;v_days integer;v_elapsed integer;v_remaining integer;v_total_projection numeric:=0;
  v_annual_assigned numeric:=0;v_annual_budgeted_spent numeric:=0;v_annual_total_spent numeric:=0;v_annual_series jsonb:='[]'::jsonb;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  v_base:=financial_app.budget_month_core(v_month);v_days:=v_next-v_month;
  v_elapsed:=case when current_date<v_month then 0 when current_date>=v_next then v_days else current_date-v_month+1 end;
  v_remaining:=greatest(0,v_days-v_elapsed);
  with items as(select b raw,coalesce((b->>'assigned')::numeric,0)+coalesce((b->>'carryIn')::numeric,0) available_budget,coalesce((b->>'spent')::numeric,0) spent from jsonb_array_elements(coalesce(v_base->'budgets','[]'::jsonb)) b),
  enriched as(select raw,available_budget,spent,
    case when v_elapsed=0 then null::numeric when v_month<date_trunc('month',current_date)::date then spent else round((spent/greatest(v_elapsed,1))*v_days,2) end projected,
    case when spent>available_budget then 'exceeded' when available_budget>0 and (spent/available_budget>=.80 or (v_elapsed>0 and v_month=date_trunc('month',current_date)::date and ((spent/greatest(v_elapsed,1))*v_days)>available_budget)) then 'attention' else 'correct' end status from items)
  select coalesce(jsonb_agg(raw||jsonb_build_object('projectedSpend',projected,'projectedDifference',case when projected is null then null else round(available_budget-projected,2) end,'status',status,'daysRemaining',v_remaining)),'[]'::jsonb),coalesce(sum(coalesce(projected,spent)),0)
  into v_budgets,v_total_projection from enriched;
  with months as(select generate_series(v_year_start,v_year_end-interval '1 month',interval '1 month')::date month_start),
  assigned as(select date_trunc('month',b.period_start)::date month_start,sum(b.amount)::numeric assigned from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start>=v_year_start and b.period_start<v_year_end group by 1),
  actual as(select date_trunc('month',l.movement_date)::date month_start,abs(sum(l.amount))::numeric total_spent from financial_app.personal_financial_lines() l where l.movement_date>=v_year_start and l.movement_date<v_year_end and l.amount<0 and l.source_missing=false and l.is_duplicate=false and l.is_internal_transfer=false and l.account_role<>'savings' and l.cash_flow_override is distinct from false group by 1),
  budgeted_actual as(select date_trunc('month',l.movement_date)::date month_start,abs(sum(l.amount))::numeric budgeted_spent from financial_app.personal_financial_lines() l where l.movement_date>=v_year_start and l.movement_date<v_year_end and l.amount<0 and l.source_missing=false and l.is_duplicate=false and l.is_internal_transfer=false and l.account_role<>'savings' and l.cash_flow_override is distinct from false and exists(select 1 from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start=date_trunc('month',l.movement_date)::date and lower(b.category)=lower(l.category) and (b.subcategory is null or lower(b.subcategory)=lower(l.subcategory))) group by 1),
  combined as(select m.month_start,coalesce(a.assigned,0) assigned,coalesce(ba.budgeted_spent,0) budgeted_spent,coalesce(ac.total_spent,0) total_spent from months m left join assigned a using(month_start) left join budgeted_actual ba using(month_start) left join actual ac using(month_start))
  select coalesce(sum(assigned),0),coalesce(sum(budgeted_spent),0),coalesce(sum(total_spent),0),coalesce(jsonb_agg(jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'assigned',round(assigned,2),'budgetedSpent',round(budgeted_spent,2),'totalSpent',round(total_spent,2),'difference',case when assigned>0 then round(assigned-budgeted_spent,2) else null end) order by month_start),'[]'::jsonb)
  into v_annual_assigned,v_annual_budgeted_spent,v_annual_total_spent,v_annual_series from combined;
  return v_base||jsonb_build_object('budgets',v_budgets,'calendar',jsonb_build_object('daysInMonth',v_days,'daysElapsed',v_elapsed,'daysRemaining',v_remaining),'projection',jsonb_build_object('projectedSpent',round(v_total_projection,2),'projectedDifference',case when coalesce((v_base->>'assigned')::numeric,0)>0 then round(coalesce((v_base->>'assigned')::numeric,0)-v_total_projection,2) else null end,'method',case when v_elapsed=0 then 'not_started' when v_month<date_trunc('month',current_date)::date then 'actual_closed' else 'current_daily_rate' end),'annual',jsonb_build_object('year',extract(year from v_year_start)::integer,'assigned',round(v_annual_assigned,2),'budgetedSpent',round(v_annual_budgeted_spent,2),'totalSpent',round(v_annual_total_spent,2),'difference',case when v_annual_assigned>0 then round(v_annual_assigned-v_annual_budgeted_spent,2) else null end,'months',v_annual_series),'statusRules',jsonb_build_object('correct','Dentro del límite y sin proyección de exceso','attention','80% consumido o proyección superior al límite','exceeded','Gasto real superior al disponible'));
end $$;
revoke all on function financial_app.budget_overview_core(date) from public,anon;
grant execute on function financial_app.budget_overview_core(date) to authenticated,service_role;
create or replace function public.financial_app_budget_month(p_month date default current_date)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.budget_overview_core(p_month)||jsonb_build_object('version',financial_app.current_app_version())$$;
revoke all on function public.financial_app_budget_month(date) from public,anon;
grant execute on function public.financial_app_budget_month(date) to authenticated,service_role;
