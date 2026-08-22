-- Financial App 1.0.0-rc.1
-- Rendimiento: consolida Análisis sobre una única lectura materializada de
-- personal_financial_lines(). Resultado JSON validado como exactamente equivalente.

create or replace function financial_app.analysis_overview_core(p_year integer default extract(year from current_date)::integer)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
 v_email text;v_year int;v_start date;v_end date;v_prev_start date;v_prev_end date;v_last_month date;v_cutoff_day int;
 v_income numeric:=0;v_expenses numeric:=0;v_net numeric:=0;v_prev_income numeric:=0;v_prev_expenses numeric:=0;v_prev_net numeric:=0;
 v_monthly jsonb:='[]'::jsonb;v_categories jsonb:='[]'::jsonb;v_merchants jsonb:='[]'::jsonb;v_types jsonb:='[]'::jsonb;v_deviations jsonb:='[]'::jsonb;v_years jsonb:='[]'::jsonb;
 v_uncat_count int:=0;v_uncat_amount numeric:=0;v_movements int:=0;v_prev_movements int:=0;
begin
 v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
 v_year:=coalesce(p_year,extract(year from current_date)::int);if v_year<2000 or v_year>2100 then raise exception 'invalid year';end if;
 v_start:=make_date(v_year,1,1);v_end:=case when v_year=extract(year from current_date)::int then current_date+1 else make_date(v_year+1,1,1) end;
 v_prev_start:=make_date(v_year-1,1,1);v_prev_end:=(v_end-interval '1 year')::date;v_last_month:=date_trunc('month',v_end-1)::date;v_cutoff_day:=extract(day from v_end-1)::int;

 with all_lines as materialized (
   select * from financial_app.personal_financial_lines()
 ), eligible as materialized (
   select * from all_lines l
   where l.source_missing=false and l.is_duplicate=false and l.is_internal_transfer=false and l.account_role<>'savings' and l.cash_flow_enabled=true and l.cash_flow_override is distinct from false
 ), metrics as (
   select
     coalesce(sum(amount) filter(where movement_date>=v_start and movement_date<v_end and amount>0),0) income,
     coalesce(abs(sum(amount) filter(where movement_date>=v_start and movement_date<v_end and amount<0)),0) expenses,
     coalesce(sum(amount) filter(where movement_date>=v_start and movement_date<v_end),0) net,
     count(distinct transaction_id) filter(where movement_date>=v_start and movement_date<v_end)::int movements,
     coalesce(sum(amount) filter(where movement_date>=v_prev_start and movement_date<v_prev_end and amount>0),0) prev_income,
     coalesce(abs(sum(amount) filter(where movement_date>=v_prev_start and movement_date<v_prev_end and amount<0)),0) prev_expenses,
     coalesce(sum(amount) filter(where movement_date>=v_prev_start and movement_date<v_prev_end),0) prev_net,
     count(distinct transaction_id) filter(where movement_date>=v_prev_start and movement_date<v_prev_end)::int prev_movements,
     count(distinct transaction_id) filter(where movement_date>=v_start and movement_date<v_end and amount<0 and category='Sin categoría')::int uncat_count,
     coalesce(abs(sum(amount) filter(where movement_date>=v_start and movement_date<v_end and amount<0 and category='Sin categoría')),0) uncat_amount
   from eligible
 ), months as (
   select generate_series(v_start,make_date(v_year,12,1),interval '1 month')::date month_start
 ), current_m as (
   select date_trunc('month',movement_date)::date month_start,coalesce(sum(amount) filter(where amount>0),0) income,coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,coalesce(sum(amount),0) net
   from eligible where movement_date>=v_start and movement_date<v_end group by 1
 ), prior_m as (
   select (date_trunc('month',movement_date)+interval '1 year')::date month_start,coalesce(sum(amount) filter(where amount>0),0) income,coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,coalesce(sum(amount),0) net
   from eligible where movement_date>=v_prev_start and movement_date<v_prev_end group by 1
 ), monthly_json as (
   select coalesce(jsonb_agg(jsonb_build_object(
     'month',to_char(m.month_start,'YYYY-MM'),'label',to_char(m.month_start,'Mon'),
     'income',round(coalesce(c.income,0),2),'expenses',round(coalesce(c.expenses,0),2),'net',round(coalesce(c.net,0),2),
     'priorIncome',case when m.month_start<v_end then round(coalesce(p.income,0),2) else null end,
     'priorExpenses',case when m.month_start<v_end then round(coalesce(p.expenses,0),2) else null end,
     'priorNet',case when m.month_start<v_end then round(coalesce(p.net,0),2) else null end,
     'available',m.month_start<v_end,
     'partial',v_year=extract(year from current_date)::int and m.month_start=date_trunc('month',current_date)::date,
     'complete',(m.month_start+interval '1 month')::date<=v_end
   ) order by m.month_start),'[]'::jsonb) j from months m left join current_m c using(month_start) left join prior_m p using(month_start)
 ), categories_json as (
   select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',round(amount,2),'movements',movements,'share',case when (select expenses from metrics)=0 then 0 else round(amount/(select expenses from metrics)*100,1) end) order by amount desc),'[]'::jsonb) j
   from (select category,abs(sum(amount)) amount,count(distinct transaction_id) movements from eligible where movement_date>=v_start and movement_date<v_end and amount<0 group by category order by amount desc limit 12) g
 ), merchants_json as (
   select coalesce(jsonb_agg(jsonb_build_object('merchant',merchant,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) j
   from (select merchant,abs(sum(amount)) amount,count(distinct transaction_id) movements from eligible where movement_date>=v_start and movement_date<v_end and amount<0 group by merchant order by amount desc limit 12) g
 ), types_json as (
   select coalesce(jsonb_agg(jsonb_build_object('type',movement_type,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) j
   from (select movement_type,abs(sum(amount)) amount,count(distinct transaction_id) movements from eligible where movement_date>=v_start and movement_date<v_end and amount<0 group by movement_type order by amount desc limit 10) g
 ), current_month as (
   select category,abs(sum(amount)) spend from eligible where amount<0 and movement_date>=v_last_month and movement_date<v_end group by category
 ), previous as (
   select category,abs(sum(amount))/3.0 avg_spend from eligible where amount<0 and movement_date>=v_last_month-interval '3 months' and movement_date<v_last_month and extract(day from movement_date)<=v_cutoff_day group by category
 ), deviation_rows as (
   select c.category,c.spend,coalesce(p.avg_spend,0) avg_spend,case when coalesce(p.avg_spend,0)=0 then null else(c.spend-p.avg_spend)/p.avg_spend*100 end change_pct
   from current_month c left join previous p using(category)
 ), deviations_json as (
   select coalesce(jsonb_agg(jsonb_build_object('category',category,'current',round(spend,2),'previous3MonthAverage',round(avg_spend,2),'changePercent',case when change_pct is null then null else round(change_pct,1) end) order by abs(coalesce(change_pct,0)) desc,spend desc),'[]'::jsonb) j
   from (select * from deviation_rows where spend>=10 and(change_pct is null or abs(change_pct)>=25) order by abs(coalesce(change_pct,999)) desc,spend desc limit 8) x
 ), years_json as (
   select coalesce(jsonb_agg(y order by y desc),'[]'::jsonb) j from (select distinct extract(year from movement_date)::int y from all_lines where movement_date is not null) s
 )
 select m.income,m.expenses,m.net,m.movements,m.prev_income,m.prev_expenses,m.prev_net,m.prev_movements,m.uncat_count,m.uncat_amount,
        mj.j,cj.j,mej.j,tj.j,dj.j,yj.j
 into v_income,v_expenses,v_net,v_movements,v_prev_income,v_prev_expenses,v_prev_net,v_prev_movements,v_uncat_count,v_uncat_amount,
      v_monthly,v_categories,v_merchants,v_types,v_deviations,v_years
 from metrics m cross join monthly_json mj cross join categories_json cj cross join merchants_json mej cross join types_json tj cross join deviations_json dj cross join years_json yj;

 return jsonb_build_object('version',financial_app.current_app_version(),'year',v_year,'periodStart',v_start,'periodEnd',(v_end-1),'comparisonYear',v_year-1,'comparisonPeriodEnd',(v_prev_end-1),'income',round(v_income,2),'expenses',round(v_expenses,2),'net',round(v_net,2),'movements',v_movements,'priorIncome',round(v_prev_income,2),'priorExpenses',round(v_prev_expenses,2),'priorNet',round(v_prev_net,2),'priorMovements',v_prev_movements,'incomeChangePercent',case when v_prev_income=0 then null else round((v_income-v_prev_income)/abs(v_prev_income)*100,1) end,'expenseChangePercent',case when v_prev_expenses=0 then null else round((v_expenses-v_prev_expenses)/abs(v_prev_expenses)*100,1) end,'netChange',round(v_net-v_prev_net,2),'uncategorizedCount',v_uncat_count,'uncategorizedAmount',round(v_uncat_amount,2),'monthly',v_monthly,'categories',v_categories,'merchants',v_merchants,'types',v_types,'deviations',v_deviations,'years',v_years,'rules',jsonb_build_object('samePeriodComparison',true,'partialMonthUsesSameElapsedDays',true,'excludeSavings',true,'excludeInternalTransfers',true,'excludeDuplicates',true,'respectCashFlowOverride',true,'personalSplitsApplied',true));
end $function$;
