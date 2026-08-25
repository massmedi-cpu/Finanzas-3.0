-- Financial App 3.4.8 — análisis por periodos arbitrarios
-- Introduce un único núcleo canónico por rango y conserva el contrato anual existente como wrapper.

create or replace function financial_app.analysis_overview_range_core(
  p_from date,
  p_to date
) returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text; v_start date; v_end date; v_prev_start date; v_prev_end date;
  v_year int; v_last_month date; v_cutoff_day int;
  v_income numeric:=0; v_expenses numeric:=0; v_net numeric:=0;
  v_prev_income numeric:=0; v_prev_expenses numeric:=0; v_prev_net numeric:=0;
  v_monthly jsonb:='[]'::jsonb; v_categories jsonb:='[]'::jsonb;
  v_merchants jsonb:='[]'::jsonb; v_types jsonb:='[]'::jsonb;
  v_deviations jsonb:='[]'::jsonb; v_years jsonb:='[]'::jsonb;
  v_uncat_count int:=0; v_uncat_amount numeric:=0; v_movements int:=0; v_prev_movements int:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_from is null or p_to is null then raise exception 'analysis range required'; end if;
  if p_from>p_to then raise exception 'invalid analysis range'; end if;
  if p_from<date '2000-01-01' or p_to>current_date then raise exception 'analysis range outside allowed dates'; end if;
  if p_to-p_from>3653 then raise exception 'analysis range too large'; end if;

  v_start:=p_from;
  v_end:=p_to;
  v_prev_start:=(v_start-interval '1 year')::date;
  v_prev_end:=(v_end-interval '1 year')::date;
  v_year:=extract(year from v_end)::int;
  v_last_month:=date_trunc('month',v_end)::date;
  v_cutoff_day:=extract(day from v_end)::int;

  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category,
      coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),'') subcategory,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') merchant,
      coalesce(nullif(t.type_override,''),nullif(t.source_transaction_type,''),'Sin tipo') movement_type
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  )
  select
    coalesce(sum(amount) filter(where d>=v_start and d<=v_end and amount>0),0),
    coalesce(abs(sum(amount) filter(where d>=v_start and d<=v_end and amount<0)),0),
    coalesce(sum(amount) filter(where d>=v_start and d<=v_end),0),
    count(*) filter(where d>=v_start and d<=v_end),
    coalesce(sum(amount) filter(where d>=v_prev_start and d<=v_prev_end and amount>0),0),
    coalesce(abs(sum(amount) filter(where d>=v_prev_start and d<=v_prev_end and amount<0)),0),
    coalesce(sum(amount) filter(where d>=v_prev_start and d<=v_prev_end),0),
    count(*) filter(where d>=v_prev_start and d<=v_prev_end),
    count(*) filter(where d>=v_start and d<=v_end and amount<0 and category='Sin categoría'),
    coalesce(abs(sum(amount) filter(where d>=v_start and d<=v_end and amount<0 and category='Sin categoría')),0)
  into v_income,v_expenses,v_net,v_movements,v_prev_income,v_prev_expenses,v_prev_net,v_prev_movements,v_uncat_count,v_uncat_amount
  from eligible;

  with months as(
    select generate_series(date_trunc('month',v_start),date_trunc('month',v_end),interval '1 month')::date month_start
  ), eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), current_m as(
    select date_trunc('month',d)::date month_start,
      coalesce(sum(amount) filter(where amount>0),0) income,
      coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,
      coalesce(sum(amount),0) net
    from eligible where d>=v_start and d<=v_end group by 1
  ), prior_m as(
    select (date_trunc('month',d)+interval '1 year')::date month_start,
      coalesce(sum(amount) filter(where amount>0),0) income,
      coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,
      coalesce(sum(amount),0) net
    from eligible where d>=v_prev_start and d<=v_prev_end group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(m.month_start,'YYYY-MM'),'label',to_char(m.month_start,'Mon'),
    'income',round(coalesce(c.income,0),2),'expenses',round(coalesce(c.expenses,0),2),'net',round(coalesce(c.net,0),2),
    'priorIncome',round(coalesce(p.income,0),2),'priorExpenses',round(coalesce(p.expenses,0),2),'priorNet',round(coalesce(p.net,0),2),
    'available',true,
    'partial',(v_start>m.month_start) or (v_end<(m.month_start+interval '1 month - 1 day')::date) or m.month_start=date_trunc('month',current_date)::date,
    'complete',v_start<=m.month_start and v_end>=(m.month_start+interval '1 month - 1 day')::date and (m.month_start+interval '1 month')::date<=current_date
  ) order by m.month_start),'[]'::jsonb)
  into v_monthly from months m left join current_m c using(month_start) left join prior_m p using(month_start);

  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), grouped as(
    select category,abs(sum(amount)) amount,count(*) movements
    from eligible where d>=v_start and d<=v_end and amount<0 group by category
  )
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',round(amount,2),'movements',movements,'share',case when v_expenses=0 then 0 else round(amount/v_expenses*100,1) end) order by amount desc),'[]'::jsonb)
  into v_categories from(select * from grouped order by amount desc limit 20)x;

  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') merchant
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), grouped as(
    select merchant,abs(sum(amount)) amount,count(*) movements
    from eligible where d>=v_start and d<=v_end and amount<0 group by merchant
  )
  select coalesce(jsonb_agg(jsonb_build_object('merchant',merchant,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb)
  into v_merchants from(select * from grouped order by amount desc limit 20)x;

  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.type_override,''),nullif(t.source_transaction_type,''),'Sin tipo') movement_type
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false
  ), grouped as(
    select movement_type,abs(sum(amount)) amount,count(*) movements
    from eligible where d>=v_start and d<=v_end and amount<0 group by movement_type
  )
  select coalesce(jsonb_agg(jsonb_build_object('type',movement_type,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb)
  into v_types from(select * from grouped order by amount desc limit 12)x;

  with eligible as(
    select coalesce(t.effective_date,t.source_date) d,t.source_amount amount,
      coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and a.account_role<>'savings' and a.cash_flow_enabled=true and t.cash_flow_override is distinct from false and t.source_amount<0
  ), current_month as(
    select category,abs(sum(amount)) spend from eligible where d>=greatest(v_last_month,v_start) and d<=v_end group by category
  ), previous as(
    select category,abs(sum(amount))/3.0 avg_spend
    from eligible
    where d>=v_last_month-interval '3 months' and d<v_last_month and extract(day from d)<=v_cutoff_day
    group by category
  ), joined as(
    select c.category,c.spend,coalesce(p.avg_spend,0) avg_spend,
      case when coalesce(p.avg_spend,0)=0 then null else(c.spend-p.avg_spend)/p.avg_spend*100 end change_pct
    from current_month c left join previous p using(category)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category',category,'current',round(spend,2),'previous3MonthAverage',round(avg_spend,2),
    'changePercent',case when change_pct is null then null else round(change_pct,1) end
  ) order by abs(coalesce(change_pct,0)) desc,spend desc),'[]'::jsonb)
  into v_deviations
  from(select * from joined where spend>=10 and(change_pct is null or abs(change_pct)>=25) order by abs(coalesce(change_pct,999)) desc,spend desc limit 10)x;

  select coalesce(jsonb_agg(y order by y desc),'[]'::jsonb) into v_years
  from(select distinct extract(year from coalesce(t.effective_date,t.source_date))::int y
       from financial_app.transactions t where coalesce(t.effective_date,t.source_date) is not null)s;

  return jsonb_build_object(
    'version','3.4.8','year',v_year,'periodStart',v_start,'periodEnd',v_end,
    'comparisonYear',extract(year from v_prev_end)::int,'comparisonPeriodEnd',v_prev_end,
    'income',round(v_income,2),'expenses',round(v_expenses,2),'net',round(v_net,2),'movements',v_movements,
    'priorIncome',round(v_prev_income,2),'priorExpenses',round(v_prev_expenses,2),'priorNet',round(v_prev_net,2),'priorMovements',v_prev_movements,
    'incomeChangePercent',case when v_prev_income=0 then null else round((v_income-v_prev_income)/abs(v_prev_income)*100,1) end,
    'expenseChangePercent',case when v_prev_expenses=0 then null else round((v_expenses-v_prev_expenses)/abs(v_prev_expenses)*100,1) end,
    'netChange',round(v_net-v_prev_net,2),'uncategorizedCount',v_uncat_count,'uncategorizedAmount',round(v_uncat_amount,2),
    'monthly',v_monthly,'categories',v_categories,'merchants',v_merchants,'types',v_types,'deviations',v_deviations,'years',v_years,
    'rules',jsonb_build_object('samePeriodComparison',true,'partialMonthUsesSameElapsedDays',true,'excludeSavings',true,'excludeInternalTransfers',true,'excludeDuplicates',true,'respectCashFlowOverride',true)
  );
end $$;

revoke all on function financial_app.analysis_overview_range_core(date,date) from public,anon;
grant execute on function financial_app.analysis_overview_range_core(date,date) to authenticated;

create or replace function financial_app.analysis_overview_core(
  p_year integer default extract(year from current_date)::int
) returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_year int;
  v_from date;
  v_to date;
begin
  v_year:=coalesce(p_year,extract(year from current_date)::int);
  if v_year<2000 or v_year>2100 then raise exception 'invalid year'; end if;
  v_from:=make_date(v_year,1,1);
  v_to:=case when v_year=extract(year from current_date)::int then current_date else make_date(v_year,12,31) end;
  return financial_app.analysis_overview_range_core(v_from,v_to);
end $$;

revoke all on function financial_app.analysis_overview_core(integer) from public,anon;
grant execute on function financial_app.analysis_overview_core(integer) to authenticated;

create or replace function public.financial_app_analysis_overview(
  p_year integer default extract(year from current_date)::int
) returns jsonb
language sql stable security invoker
set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.analysis_overview_core(p_year) $$;

revoke all on function public.financial_app_analysis_overview(integer) from public,anon;
grant execute on function public.financial_app_analysis_overview(integer) to authenticated;

create or replace function public.financial_app_analysis_overview_period(
  p_from date,
  p_to date
) returns jsonb
language sql stable security invoker
set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.analysis_overview_range_core(p_from,p_to) $$;

revoke all on function public.financial_app_analysis_overview_period(date,date) from public,anon;
grant execute on function public.financial_app_analysis_overview_period(date,date) to authenticated;
