-- Financial App 0.9.0 · Análisis real
create or replace function financial_app.analysis_overview_core(p_year integer default extract(year from current_date)::int) returns jsonb
language plpgsql stable security definer set search_path='pg_catalog','financial_app','auth' as $$
declare
  v_email text;v_first_year int;v_last_year int;v_through_month int;v_years jsonb:='[]'::jsonb;v_monthly jsonb:='[]'::jsonb;
  v_categories jsonb:='[]'::jsonb;v_merchants jsonb:='[]'::jsonb;v_income_sources jsonb:='[]'::jsonb;v_high_months jsonb:='[]'::jsonb;
  v_income numeric:=0;v_expenses numeric:=0;v_net numeric:=0;v_prev_income numeric:=0;v_prev_expenses numeric:=0;v_prev_net numeric:=0;
  v_months_observed int:=0;v_avg_income numeric:=0;v_avg_expenses numeric:=0;v_savings_rate numeric:=0;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  select extract(year from min(coalesce(effective_date,source_date)))::int,extract(year from max(coalesce(effective_date,source_date)))::int into v_first_year,v_last_year from financial_app.transactions where source_missing=false;
  if v_first_year is null then return jsonb_build_object('version','0.9.0','years','[]'::jsonb);end if;
  if p_year is null or p_year<v_first_year or p_year>v_last_year then p_year:=v_last_year;end if;
  select coalesce(max(extract(month from coalesce(t.effective_date,t.source_date)))::int,12) into v_through_month from financial_app.transactions t where t.source_missing=false and extract(year from coalesce(t.effective_date,t.source_date))::int=p_year;
  select coalesce(jsonb_agg(y order by y desc),'[]'::jsonb) into v_years from generate_series(v_first_year,v_last_year) y;
  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') counterparty
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), current_period as(select * from eligible where extract(year from d)::int=p_year and extract(month from d)::int<=v_through_month)
  select coalesce(sum(amount) filter(where amount>0),0),coalesce(abs(sum(amount) filter(where amount<0)),0),coalesce(sum(amount),0),count(distinct extract(month from d)::int)
  into v_income,v_expenses,v_net,v_months_observed from current_period;
  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), previous_period as(select * from eligible where extract(year from d)::int=p_year-1 and extract(month from d)::int<=v_through_month)
  select coalesce(sum(amount) filter(where amount>0),0),coalesce(abs(sum(amount) filter(where amount<0)),0),coalesce(sum(amount),0) into v_prev_income,v_prev_expenses,v_prev_net from previous_period;
  v_avg_income:=case when v_months_observed>0 then v_income/v_months_observed else 0 end;
  v_avg_expenses:=case when v_months_observed>0 then v_expenses/v_months_observed else 0 end;
  v_savings_rate:=case when v_income<>0 then round((v_net/v_income*100)::numeric,2) else 0 end;
  with month_series as(select generate_series(1,12) m),eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ),cur as(select extract(month from d)::int m,coalesce(sum(amount) filter(where amount>0),0) income,coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,coalesce(sum(amount),0) net,count(*) movements from eligible where extract(year from d)::int=p_year group by 1),
  prev as(select extract(month from d)::int m,coalesce(sum(amount) filter(where amount>0),0) income,coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,coalesce(sum(amount),0) net from eligible where extract(year from d)::int=p_year-1 group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('month',lpad(month_series.m::text,2,'0'),'observed',month_series.m<=v_through_month,'income',case when month_series.m<=v_through_month then coalesce(cur.income,0) else null end,'expenses',case when month_series.m<=v_through_month then coalesce(cur.expenses,0) else null end,'net',case when month_series.m<=v_through_month then coalesce(cur.net,0) else null end,'movements',case when month_series.m<=v_through_month then coalesce(cur.movements,0) else null end,'previousIncome',case when month_series.m<=v_through_month then coalesce(prev.income,0) else null end,'previousExpenses',case when month_series.m<=v_through_month then coalesce(prev.expenses,0) else null end,'previousNet',case when month_series.m<=v_through_month then coalesce(prev.net,0) else null end) order by month_series.m),'[]'::jsonb) into v_monthly from month_series left join cur using(m) left join prev using(m);
  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ),cur as(select category,abs(sum(amount)) amount,count(*) movements from eligible where amount<0 and extract(year from d)::int=p_year and extract(month from d)::int<=v_through_month group by category),
  prev as(select category,abs(sum(amount)) amount from eligible where amount<0 and extract(year from d)::int=p_year-1 and extract(month from d)::int<=v_through_month group by category),ranked as(select cur.category,cur.amount,cur.movements,coalesce(prev.amount,0) previous_amount,case when coalesce(prev.amount,0)>0 then round(((cur.amount-prev.amount)/prev.amount*100)::numeric,2) else null end change_pct from cur left join prev using(category) order by cur.amount desc limit 12)
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',round(amount,2),'movements',movements,'previousAmount',round(previous_amount,2),'changePercent',change_pct) order by amount desc),'[]'::jsonb) into v_categories from ranked;
  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') counterparty
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ),r as(select counterparty,abs(sum(amount)) amount,count(*) movements from eligible where amount<0 and extract(year from d)::int=p_year and extract(month from d)::int<=v_through_month group by counterparty order by amount desc limit 10)
  select coalesce(jsonb_agg(jsonb_build_object('name',counterparty,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) into v_merchants from r;
  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') counterparty
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ),r as(select counterparty,sum(amount) amount,count(*) movements from eligible where amount>0 and extract(year from d)::int=p_year and extract(month from d)::int<=v_through_month group by counterparty order by amount desc limit 10)
  select coalesce(jsonb_agg(jsonb_build_object('name',counterparty,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) into v_income_sources from r;
  with observed_months as(select x->>'month' as month_key,(x->>'expenses')::numeric expenses from jsonb_array_elements(v_monthly) x where (x->>'observed')::boolean),ranked as(select month_key,expenses,case when v_avg_expenses>0 then round(((expenses-v_avg_expenses)/v_avg_expenses*100)::numeric,2) else 0 end deviation from observed_months where expenses>v_avg_expenses*1.2 order by expenses desc limit 6)
  select coalesce(jsonb_agg(jsonb_build_object('month',month_key,'expenses',round(expenses,2),'deviationPercent',deviation) order by expenses desc),'[]'::jsonb) into v_high_months from ranked;
  return jsonb_build_object('version','0.9.0','year',p_year,'previousYear',p_year-1,'throughMonth',v_through_month,'years',v_years,'income',round(v_income,2),'expenses',round(v_expenses,2),'net',round(v_net,2),'previousIncome',round(v_prev_income,2),'previousExpenses',round(v_prev_expenses,2),'previousNet',round(v_prev_net,2),'incomeChangePercent',case when v_prev_income<>0 then round(((v_income-v_prev_income)/abs(v_prev_income)*100)::numeric,2) else null end,'expenseChangePercent',case when v_prev_expenses<>0 then round(((v_expenses-v_prev_expenses)/abs(v_prev_expenses)*100)::numeric,2) else null end,'netChange',round(v_net-v_prev_net,2),'monthsObserved',v_months_observed,'averageMonthlyIncome',round(v_avg_income,2),'averageMonthlyExpenses',round(v_avg_expenses,2),'savingsRatePercent',v_savings_rate,'monthly',v_monthly,'categories',v_categories,'merchants',v_merchants,'incomeSources',v_income_sources,'highExpenseMonths',v_high_months,'rules',jsonb_build_object('samePeriodComparison',true,'savingsExcluded',true,'internalTransfersExcluded',true,'duplicatesExcluded',true,'manualCashFlowExclusionsRespected',true));
end $$;
revoke all on function financial_app.analysis_overview_core(integer) from public,anon;
grant execute on function financial_app.analysis_overview_core(integer) to authenticated;
create or replace function public.financial_app_analysis_overview(p_year integer default extract(year from current_date)::int) returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.analysis_overview_core(p_year)$$;
revoke all on function public.financial_app_analysis_overview(integer) from public,anon;
grant execute on function public.financial_app_analysis_overview(integer) to authenticated;
insert into financial_app.app_meta(key,value) values('schema_version','"0.9.0"'::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now();
