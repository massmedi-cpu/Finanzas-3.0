-- Financial App 1.0.0-rc.1
-- Rendimiento: consolida el cálculo mensual de Presupuesto sobre una sola lectura
-- financiera y reutiliza presupuestos actuales/anteriores. Resultado JSON validado
-- como exactamente equivalente a la versión anterior.

create or replace function financial_app.budget_month_core(p_month date default current_date)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
 v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;v_next date:=(v_month+interval '1 month')::date;v_prev date:=(v_month-interval '1 month')::date;v_hist_start date:=(v_month-interval '3 months')::date;
 v_budgeted jsonb:='[]'::jsonb;v_unbudgeted jsonb:='[]'::jsonb;v_categories jsonb:='[]'::jsonb;v_assigned numeric:=0;v_spent numeric:=0;v_available numeric:=0;v_unbudgeted_spent numeric:=0;v_over int:=0;
begin
 if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501';end if;
 with all_lines as materialized (
   select * from financial_app.personal_financial_lines()
 ), spending_lines as materialized (
   select * from all_lines l where l.source_missing=false and l.is_duplicate=false and l.is_internal_transfer=false and l.account_role<>'savings' and l.amount<0
 ), current_budgets as materialized (
   select b.* from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start=v_month
 ), prior_budgets as materialized (
   select b.* from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start=v_prev
 ), b_rows as (
   select b.*,
     coalesce((select abs(sum(l.amount)) from spending_lines l where l.movement_date>=v_month and l.movement_date<v_next and lower(l.category)=lower(b.category) and (b.subcategory is null or lower(l.subcategory)=lower(b.subcategory))),0)::numeric spent,
     coalesce((select count(distinct l.transaction_id) from spending_lines l where l.movement_date>=v_month and l.movement_date<v_next and lower(l.category)=lower(b.category) and (b.subcategory is null or lower(l.subcategory)=lower(b.subcategory))),0)::int movements,
     coalesce((select abs(sum(l.amount))/3.0 from spending_lines l where l.movement_date>=v_hist_start and l.movement_date<v_month and lower(l.category)=lower(b.category) and (b.subcategory is null or lower(l.subcategory)=lower(b.subcategory))),0)::numeric suggestion,
     case when b.carryover then greatest(coalesce((
       select pb.amount-coalesce((select abs(sum(l.amount)) from spending_lines l where l.movement_date>=v_prev and l.movement_date<v_month and lower(l.category)=lower(pb.category) and (pb.subcategory is null or lower(l.subcategory)=lower(pb.subcategory))),0)
       from prior_budgets pb where lower(pb.category)=lower(b.category) and lower(coalesce(pb.subcategory,''))=lower(coalesce(b.subcategory,'')) limit 1
     ),0),0) else 0 end::numeric carry_in
   from current_budgets b
 ), budget_summary as (
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'subcategory',subcategory,'assigned',round(amount,2),'spent',round(spent,2),'carryover',carryover,'carryIn',round(carry_in,2),'available',round(amount+carry_in-spent,2),'percent',case when amount+carry_in>0 then round(spent/(amount+carry_in)*100,1) else case when spent>0 then 100 else 0 end end,'suggestion',round(suggestion,2),'movements',movements,'notes',notes) order by sort_order,category,subcategory),'[]'::jsonb) budgets,
          coalesce(sum(amount),0) assigned,coalesce(sum(spent),0) spent,coalesce(sum(amount+carry_in-spent),0) available,count(*) filter(where amount+carry_in-spent<0)::int over_count
   from b_rows
 ), actual as (
   select l.category,l.subcategory,abs(sum(l.amount)) spent,count(distinct l.transaction_id)::int movements
   from spending_lines l where l.movement_date>=v_month and l.movement_date<v_next group by l.category,l.subcategory
 ), u as (
   select a.category,a.subcategory,a.spent,a.movements,
     coalesce((select abs(sum(l.amount))/3.0 from spending_lines l where l.movement_date>=v_hist_start and l.movement_date<v_month and lower(l.category)=lower(a.category) and lower(coalesce(l.subcategory,''))=lower(coalesce(a.subcategory,''))),0)::numeric suggestion
   from actual a
   where not exists(select 1 from current_budgets b where lower(b.category)=lower(a.category) and (b.subcategory is null or lower(b.subcategory)=lower(a.subcategory)))
 ), unbudgeted_summary as (
   select coalesce(jsonb_agg(jsonb_build_object('category',category,'subcategory',nullif(subcategory,''),'spent',round(spent,2),'suggestion',round(suggestion,2),'movements',movements) order by spent desc,category),'[]'::jsonb) unbudgeted,
          coalesce(sum(spent),0) unbudgeted_spent
   from u
 ), categories_json as (
   select coalesce(jsonb_agg(category order by category),'[]'::jsonb) categories from(select distinct category from spending_lines)x
 )
 select bs.budgets,bs.assigned,bs.spent,bs.available,bs.over_count,us.unbudgeted,us.unbudgeted_spent,cj.categories
 into v_budgeted,v_assigned,v_spent,v_available,v_over,v_unbudgeted,v_unbudgeted_spent,v_categories
 from budget_summary bs cross join unbudgeted_summary us cross join categories_json cj;
 return jsonb_build_object('version',financial_app.current_app_version(),'month',to_char(v_month,'YYYY-MM'),'assigned',round(v_assigned,2),'spent',round(v_spent,2),'available',round(v_available,2),'overBudgetCount',v_over,'unbudgetedSpent',round(v_unbudgeted_spent,2),'budgets',v_budgeted,'unbudgeted',v_unbudgeted,'categories',v_categories,'rules',jsonb_build_object('personalSplitsApplied',true));
end $function$;
