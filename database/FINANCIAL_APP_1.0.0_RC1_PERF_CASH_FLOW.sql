-- Financial App 1.0.0-rc.1
-- Rendimiento: una sola lectura materializada de personal_financial_lines()
-- para resumen, serie, categorías, comercios y facetas de Cash Flow.
-- Resultado JSON validado como exactamente equivalente a la versión anterior.

create or replace function financial_app.cash_flow_range_core(
  p_range text default 'year', p_anchor date default current_date, p_date_from date default null, p_date_to date default null,
  p_account_id uuid default null, p_category text default null, p_subcategory text default null, p_merchant text default null, p_type text default null
) returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
 v_email text;v_range text:=lower(trim(coalesce(p_range,'year')));v_anchor date:=coalesce(p_anchor,current_date);v_start date;v_end date;v_bucket text;v_days int;
 v_income numeric:=0;v_expenses numeric:=0;v_net numeric:=0;v_count int:=0;v_positive int:=0;v_negative int:=0;
 v_series jsonb:='[]'::jsonb;v_categories jsonb:='[]'::jsonb;v_merchants jsonb:='[]'::jsonb;v_facets jsonb:='{}'::jsonb;
 v_excluded_savings int:=0;v_excluded_transfers int:=0;v_excluded_duplicates int:=0;v_excluded_manual int:=0;v_excluded_missing int:=0;
begin
 v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
 if v_range='day' then v_start:=v_anchor;v_end:=v_anchor+1;v_bucket:='day';
 elsif v_range='week' then v_start:=date_trunc('week',v_anchor)::date;v_end:=v_start+7;v_bucket:='day';
 elsif v_range='month' then v_start:=date_trunc('month',v_anchor)::date;v_end:=(v_start+interval '1 month')::date;v_bucket:='day';
 elsif v_range='quarter' then v_start:=date_trunc('quarter',v_anchor)::date;v_end:=(v_start+interval '3 months')::date;v_bucket:='week';
 elsif v_range='year' then v_start:=date_trunc('year',v_anchor)::date;v_end:=(v_start+interval '1 year')::date;v_bucket:='month';
 elsif v_range='historical' then
   select min(coalesce(effective_date,source_date)),max(coalesce(effective_date,source_date))+1 into v_start,v_end from financial_app.transactions where coalesce(effective_date,source_date) is not null;
   if v_start is null then v_start:=v_anchor;v_end:=v_anchor+1;end if;v_bucket:='month';
 elsif v_range='custom' then
   if p_date_from is null or p_date_to is null or p_date_to<p_date_from then raise exception 'invalid_custom_range';end if;
   v_start:=p_date_from;v_end:=p_date_to+1;v_days:=p_date_to-p_date_from+1;
   v_bucket:=case when v_days<=62 then 'day' when v_days<=366 then 'week' else 'month' end;
 else raise exception 'invalid_range';end if;

 with all_lines as materialized (
   select * from financial_app.personal_financial_lines()
 ), eligible as materialized (
   select * from all_lines l
   where l.movement_date>=v_start and l.movement_date<v_end and l.source_missing=false and l.is_duplicate=false and l.is_internal_transfer=false and l.account_role<>'savings' and l.cash_flow_enabled=true and l.cash_flow_override is distinct from false
     and (p_account_id is null or l.account_id=p_account_id)
     and (nullif(trim(coalesce(p_category,'')),'') is null or l.category=p_category)
     and (nullif(trim(coalesce(p_subcategory,'')),'') is null or l.subcategory=p_subcategory)
     and (nullif(trim(coalesce(p_merchant,'')),'') is null or l.merchant=p_merchant)
     and (nullif(trim(coalesce(p_type,'')),'') is null or l.movement_type=p_type)
 ), summary as (
   select coalesce(sum(amount) filter(where amount>0),0) income,
          coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,
          coalesce(sum(amount),0) net,
          count(distinct transaction_id)::int movements
   from eligible
 ), bucketed as (
   select case when v_bucket='day' then movement_date when v_bucket='week' then date_trunc('week',movement_date)::date else date_trunc('month',movement_date)::date end bucket,
          coalesce(sum(amount) filter(where amount>0),0) income,
          coalesce(abs(sum(amount) filter(where amount<0)),0) expenses,
          coalesce(sum(amount),0) net,
          count(distinct transaction_id) movements
   from eligible group by 1
 ), bounds as (
   select case when v_bucket='day' then '1 day'::interval when v_bucket='week' then '1 week'::interval else '1 month'::interval end step
 ), grid as (
   select generate_series(
     case when v_bucket='week' then date_trunc('week',v_start)::date else v_start end,
     case when v_bucket='day' then v_end-1 when v_bucket='week' then date_trunc('week',v_end-1)::date else date_trunc('month',v_end-1)::date end,
     step
   )::date bucket from bounds
 ), series as (
   select g.bucket,coalesce(b.income,0) income,coalesce(b.expenses,0) expenses,coalesce(b.net,0) net,coalesce(b.movements,0) movements
   from grid g left join bucketed b using(bucket)
 ), acc as (
   select *,sum(net) over(order by bucket) accumulated from series
 ), series_json as (
   select coalesce(jsonb_agg(jsonb_build_object('date',bucket,'label',case when v_bucket='month' then to_char(bucket,'YYYY-MM') else to_char(bucket,'YYYY-MM-DD') end,'income',round(income,2),'expenses',round(expenses,2),'net',round(net,2),'accumulated',round(accumulated,2),'movements',movements) order by bucket),'[]'::jsonb) j,
          count(*) filter(where net>0)::int positive,
          count(*) filter(where net<0)::int negative
   from acc
 ), category_json as (
   select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) j
   from (select category,abs(sum(amount)) amount,count(distinct transaction_id) movements from eligible where amount<0 group by category order by amount desc limit 10) g
 ), merchant_json as (
   select coalesce(jsonb_agg(jsonb_build_object('merchant',merchant,'amount',round(amount,2),'movements',movements) order by amount desc),'[]'::jsonb) j
   from (select merchant,abs(sum(amount)) amount,count(distinct transaction_id) movements from eligible where amount<0 group by merchant order by amount desc limit 10) g
 ), facets_json as (
   select jsonb_build_object(
     'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'identifier',a.external_identifier) order by a.name) from financial_app.accounts a where a.active=true and a.account_role<>'savings'),'[]'::jsonb),
     'categories',coalesce((select jsonb_agg(x.v order by x.v) from(select distinct category v from all_lines where category is not null)x),'[]'::jsonb),
     'subcategories',coalesce((select jsonb_agg(x.v order by x.v) from(select distinct subcategory v from all_lines where nullif(subcategory,'') is not null)x),'[]'::jsonb),
     'merchants',coalesce((select jsonb_agg(x.v order by x.v) from(select distinct merchant v from all_lines where nullif(merchant,'') is not null)x),'[]'::jsonb),
     'types',coalesce((select jsonb_agg(x.v order by x.v) from(select distinct movement_type v from all_lines where nullif(movement_type,'') is not null)x),'[]'::jsonb)
   ) j
 )
 select s.income,s.expenses,s.net,s.movements,sj.j,sj.positive,sj.negative,cj.j,mj.j,fj.j
 into v_income,v_expenses,v_net,v_count,v_series,v_positive,v_negative,v_categories,v_merchants,v_facets
 from summary s cross join series_json sj cross join category_json cj cross join merchant_json mj cross join facets_json fj;

 select
   count(*) filter(where t.source_missing=false and a.account_role='savings')::int,
   count(*) filter(where t.source_missing=false and a.account_role<>'savings' and t.is_internal_transfer=true)::int,
   count(*) filter(where t.source_missing=false and a.account_role<>'savings' and t.is_duplicate=true)::int,
   count(*) filter(where t.source_missing=false and a.account_role<>'savings' and t.is_duplicate=false and t.is_internal_transfer=false and t.cash_flow_override=false)::int,
   count(*) filter(where t.source_missing=true)::int
 into v_excluded_savings,v_excluded_transfers,v_excluded_duplicates,v_excluded_manual,v_excluded_missing
 from financial_app.transactions t left join financial_app.accounts a on a.id=t.account_id
 where coalesce(t.effective_date,t.source_date)>=v_start and coalesce(t.effective_date,t.source_date)<v_end;

 return jsonb_build_object('version',financial_app.current_app_version(),'range',v_range,'anchor',v_anchor,'dateFrom',v_start,'dateTo',v_end-1,'bucket',v_bucket,'income',round(v_income,2),'expenses',round(v_expenses,2),'net',round(v_net,2),'movements',v_count,'positivePeriods',v_positive,'negativePeriods',v_negative,'series',v_series,'topExpenseCategories',v_categories,'topMerchants',v_merchants,'facets',v_facets,'filters',jsonb_build_object('accountId',p_account_id,'category',p_category,'subcategory',p_subcategory,'merchant',p_merchant,'type',p_type),'excluded',jsonb_build_object('savings',v_excluded_savings,'internalTransfers',v_excluded_transfers,'duplicates',v_excluded_duplicates,'manual',v_excluded_manual,'sourceMissing',v_excluded_missing),'rules',jsonb_build_object('savingsAlwaysExcluded',true,'internalTransfersExcluded',true,'duplicatesExcluded',true,'sourceMissingExcluded',true,'personalSplitsApplied',true));
end $function$;
