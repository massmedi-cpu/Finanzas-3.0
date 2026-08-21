-- Financial App 0.6.0 — Presupuesto real
-- Aplicado en Supabase antes de publicar el commit 0.6.0.
-- Requiere las funciones/base 0.5.0 ya instaladas, incluida financial_app.authorized_email().

alter table financial_app.budgets add column if not exists carryover boolean not null default false;
alter table financial_app.budgets add column if not exists notes text;
alter table financial_app.budgets add column if not exists sort_order integer not null default 0;

create unique index if not exists budgets_active_month_category_uq
on financial_app.budgets (period_start, lower(category), lower(coalesce(subcategory,'')))
where active=true and period_type='monthly';
create index if not exists budgets_period_start_idx on financial_app.budgets(period_start) where active=true;

create table if not exists financial_app.budget_history (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid references financial_app.budgets(id) on delete set null,
  action text not null check (action in ('created','updated','deactivated')),
  before_value jsonb,
  after_value jsonb,
  changed_by text,
  changed_at timestamptz not null default now()
);
alter table financial_app.budget_history enable row level security;
revoke all on financial_app.budget_history from public,anon,authenticated;
create index if not exists budget_history_budget_id_idx on financial_app.budget_history(budget_id);

create or replace function financial_app.budget_month_core(p_month date default current_date)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,financial_app,auth as $$
declare
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_next date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_prev date:=(date_trunc('month',coalesce(p_month,current_date))-interval '1 month')::date;
  v_hist_start date:=(date_trunc('month',coalesce(p_month,current_date))-interval '3 months')::date;
  v_budgeted jsonb:='[]'::jsonb; v_unbudgeted jsonb:='[]'::jsonb; v_categories jsonb:='[]'::jsonb;
  v_assigned numeric:=0; v_spent numeric:=0; v_available numeric:=0; v_unbudgeted_spent numeric:=0; v_over integer:=0;
begin
  if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501'; end if;

  with b_rows as (
    select b.*,
      coalesce((select abs(sum(t.source_amount)) from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
        where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0
          and coalesce(t.effective_date,t.source_date)>=v_month and coalesce(t.effective_date,t.source_date)<v_next
          and lower(coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'))=lower(b.category)
          and (b.subcategory is null or lower(coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''))=lower(b.subcategory))),0)::numeric spent,
      coalesce((select count(*) from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
        where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0
          and coalesce(t.effective_date,t.source_date)>=v_month and coalesce(t.effective_date,t.source_date)<v_next
          and lower(coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'))=lower(b.category)
          and (b.subcategory is null or lower(coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''))=lower(b.subcategory))),0)::int movements,
      coalesce((select abs(sum(t.source_amount))/3.0 from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
        where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0
          and coalesce(t.effective_date,t.source_date)>=v_hist_start and coalesce(t.effective_date,t.source_date)<v_month
          and lower(coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'))=lower(b.category)
          and (b.subcategory is null or lower(coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''))=lower(b.subcategory))),0)::numeric suggestion,
      case when b.carryover then greatest(coalesce((select pb.amount-coalesce((select abs(sum(t.source_amount)) from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
        where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0
          and coalesce(t.effective_date,t.source_date)>=v_prev and coalesce(t.effective_date,t.source_date)<v_month
          and lower(coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'))=lower(pb.category)
          and (pb.subcategory is null or lower(coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''))=lower(pb.subcategory))),0)
        from financial_app.budgets pb where pb.active=true and pb.period_type='monthly' and pb.period_start=v_prev
          and lower(pb.category)=lower(b.category) and lower(coalesce(pb.subcategory,''))=lower(coalesce(b.subcategory,'')) limit 1),0),0) else 0 end::numeric carry_in
    from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start=v_month
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'subcategory',subcategory,'assigned',round(amount,2),'spent',round(spent,2),'carryover',carryover,'carryIn',round(carry_in,2),'available',round(amount+carry_in-spent,2),'percent',case when amount+carry_in>0 then round((spent/(amount+carry_in))*100,1) else case when spent>0 then 100 else 0 end end,'suggestion',round(suggestion,2),'movements',movements,'notes',notes) order by sort_order,category,subcategory),'[]'::jsonb),coalesce(sum(amount),0),coalesce(sum(spent),0),coalesce(sum(amount+carry_in-spent),0),count(*) filter(where amount+carry_in-spent<0)
  into v_budgeted,v_assigned,v_spent,v_available,v_over from b_rows;

  with actual as (
    select coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category,
      coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),'') subcategory,
      abs(sum(t.source_amount))::numeric spent,count(*)::int movements
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
    where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0
      and coalesce(t.effective_date,t.source_date)>=v_month and coalesce(t.effective_date,t.source_date)<v_next group by 1,2
  ), u as (
    select a.category,a.subcategory,a.spent,a.movements,
      coalesce((select abs(sum(t.source_amount))/3.0 from financial_app.transactions t join financial_app.accounts ac on ac.id=t.account_id
        where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and ac.account_role<>'savings' and t.source_amount<0
          and coalesce(t.effective_date,t.source_date)>=v_hist_start and coalesce(t.effective_date,t.source_date)<v_month
          and lower(coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'))=lower(a.category)
          and lower(coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''))=lower(a.subcategory)),0)::numeric suggestion
    from actual a where not exists(select 1 from financial_app.budgets b where b.active=true and b.period_type='monthly' and b.period_start=v_month
      and lower(b.category)=lower(a.category) and (b.subcategory is null or lower(b.subcategory)=lower(a.subcategory)))
  )
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'subcategory',nullif(subcategory,''),'spent',round(spent,2),'suggestion',round(suggestion,2),'movements',movements) order by spent desc,category),'[]'::jsonb),coalesce(sum(spent),0) into v_unbudgeted,v_unbudgeted_spent from u;

  with cats as (select distinct coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') category from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id where t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false and a.account_role<>'savings' and t.source_amount<0)
  select coalesce(jsonb_agg(category order by category),'[]'::jsonb) into v_categories from cats;

  return jsonb_build_object('version','0.6.0','month',to_char(v_month,'YYYY-MM'),'assigned',round(v_assigned,2),'spent',round(v_spent,2),'available',round(v_available,2),'overBudgetCount',v_over,'unbudgetedSpent',round(v_unbudgeted_spent,2),'budgets',v_budgeted,'unbudgeted',v_unbudgeted,'categories',v_categories);
end;$$;

create or replace function financial_app.upsert_budget_core(p_budget_id uuid,p_month date,p_category text,p_subcategory text,p_amount numeric,p_carryover boolean default false,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,financial_app,auth as $$
declare v_email text:=financial_app.authorized_email(); v_month date:=date_trunc('month',coalesce(p_month,current_date))::date; v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date; v_before jsonb; v_row financial_app.budgets%rowtype;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_amount is null or p_amount<0 or p_amount>100000000 then raise exception 'invalid_amount' using errcode='22023'; end if;
  if nullif(trim(p_category),'') is null or length(trim(p_category))>120 then raise exception 'invalid_category' using errcode='22023'; end if;
  if p_budget_id is null then
    insert into financial_app.budgets(name,category,subcategory,period_type,period_start,period_end,amount,active,carryover,notes)
    values(trim(p_category),trim(p_category),nullif(trim(coalesce(p_subcategory,'')),''),'monthly',v_month,v_end,round(p_amount,2),true,coalesce(p_carryover,false),nullif(trim(coalesce(p_notes,'')),'')) returning * into v_row;
    insert into financial_app.budget_history(budget_id,action,after_value,changed_by) values(v_row.id,'created',to_jsonb(v_row),v_email);
  else
    select to_jsonb(b) into v_before from financial_app.budgets b where b.id=p_budget_id and b.active=true for update;
    if v_before is null then raise exception 'budget_not_found' using errcode='P0002'; end if;
    update financial_app.budgets set name=trim(p_category),category=trim(p_category),subcategory=nullif(trim(coalesce(p_subcategory,'')),''),period_type='monthly',period_start=v_month,period_end=v_end,amount=round(p_amount,2),carryover=coalesce(p_carryover,false),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=p_budget_id returning * into v_row;
    insert into financial_app.budget_history(budget_id,action,before_value,after_value,changed_by) values(v_row.id,'updated',v_before,to_jsonb(v_row),v_email);
  end if;
  return jsonb_build_object('ok',true,'budget',to_jsonb(v_row));
exception when unique_violation then raise exception 'budget_category_already_exists' using errcode='23505';
end;$$;

create or replace function financial_app.deactivate_budget_core(p_budget_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,financial_app,auth as $$
declare v_email text:=financial_app.authorized_email(); v_before jsonb; v_row financial_app.budgets%rowtype;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select to_jsonb(b) into v_before from financial_app.budgets b where b.id=p_budget_id and b.active=true for update;
  if v_before is null then raise exception 'budget_not_found' using errcode='P0002'; end if;
  update financial_app.budgets set active=false,updated_at=now() where id=p_budget_id returning * into v_row;
  insert into financial_app.budget_history(budget_id,action,before_value,after_value,changed_by) values(p_budget_id,'deactivated',v_before,to_jsonb(v_row),v_email);
  return jsonb_build_object('ok',true);
end;$$;

revoke all on function financial_app.budget_month_core(date) from public,anon,authenticated;
revoke all on function financial_app.upsert_budget_core(uuid,date,text,text,numeric,boolean,text) from public,anon,authenticated;
revoke all on function financial_app.deactivate_budget_core(uuid) from public,anon,authenticated;

create or replace function public.financial_app_budget_month(p_month date default current_date)
returns jsonb language sql stable security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.budget_month_core(p_month);$$;
create or replace function public.financial_app_upsert_budget(p_budget_id uuid,p_month date,p_category text,p_subcategory text,p_amount numeric,p_carryover boolean default false,p_notes text default null)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.upsert_budget_core(p_budget_id,p_month,p_category,p_subcategory,p_amount,p_carryover,p_notes);$$;
create or replace function public.financial_app_deactivate_budget(p_budget_id uuid)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.deactivate_budget_core(p_budget_id);$$;

revoke all on function public.financial_app_budget_month(date) from public,anon;
revoke all on function public.financial_app_upsert_budget(uuid,date,text,text,numeric,boolean,text) from public,anon;
revoke all on function public.financial_app_deactivate_budget(uuid) from public,anon;
grant execute on function public.financial_app_budget_month(date) to authenticated;
grant execute on function public.financial_app_upsert_budget(uuid,date,text,text,numeric,boolean,text) to authenticated;
grant execute on function public.financial_app_deactivate_budget(uuid) to authenticated;

update financial_app.app_meta set value='"0.6.0"'::jsonb,updated_at=now() where key='schema_version';
