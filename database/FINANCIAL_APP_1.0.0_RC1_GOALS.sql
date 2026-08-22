-- Financial App 1.0.0-rc.1 — Objetivos financieros
-- Capa privada reversible. No modifica la fuente bancaria.

create table if not exists financial_app.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal_type text not null default 'savings' check (goal_type in ('savings','purchase','emergency','custom')),
  target_amount numeric(14,2) not null check (target_amount > 0 and target_amount <= 100000000),
  progress_mode text not null default 'manual' check (progress_mode in ('manual','account')),
  manual_amount numeric(14,2) not null default 0 check (manual_amount >= 0 and manual_amount <= 100000000),
  account_id uuid references financial_app.accounts(id) on delete set null,
  target_date date,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  notes text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financial_app.goal_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references financial_app.goals(id) on delete set null,
  action text not null check (action in ('created','updated','deactivated')),
  before_value jsonb,
  after_value jsonb,
  changed_by text,
  changed_at timestamptz not null default now()
);

alter table financial_app.goals enable row level security;
alter table financial_app.goal_history enable row level security;
revoke all on financial_app.goals from public,anon,authenticated;
revoke all on financial_app.goal_history from public,anon,authenticated;
create index if not exists goals_active_priority_idx on financial_app.goals(active,priority,target_date);
create index if not exists goals_account_id_idx on financial_app.goals(account_id) where account_id is not null;
create index if not exists goal_history_goal_id_idx on financial_app.goal_history(goal_id);

create or replace function financial_app.goals_overview_core()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,financial_app,auth as $$
declare
  v_email text:=financial_app.authorized_email();
  v_goals jsonb:='[]'::jsonb;v_accounts jsonb:='[]'::jsonb;v_summary jsonb:='{}'::jsonb;
  v_capacity_data jsonb;v_capacity numeric:=0;v_month_start date:=date_trunc('month',current_date)::date;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_capacity_data:=financial_app.cash_flow_range_core('custom',current_date,(v_month_start-interval '3 months')::date,(v_month_start-interval '1 day')::date,null,null,null,null,null);
  v_capacity:=round(coalesce((v_capacity_data->>'net')::numeric,0)/3.0,2);

  with account_balances as (
    select a.id,a.name,a.account_role,a.currency,bal.source_balance::numeric balance,bal.source_date balance_date
    from financial_app.accounts a left join lateral (
      select t.source_balance,t.source_date from financial_app.transactions t
      where t.account_id=a.id and t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null
      order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
    ) bal on true where a.active=true
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',account_role,'currency',currency,'balance',balance,'balanceDate',balance_date)
    order by case when account_role='savings' then 0 when account_role='operating' then 1 else 2 end,name),'[]'::jsonb)
  into v_accounts from account_balances;

  with account_balances as (
    select a.id,a.name,bal.source_balance::numeric balance,bal.source_date balance_date
    from financial_app.accounts a left join lateral (
      select t.source_balance,t.source_date from financial_app.transactions t
      where t.account_id=a.id and t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null
      order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
    ) bal on true where a.active=true
  ), base as (
    select g.*,a.name account_name,a.balance account_balance,a.balance_date,
      case when g.progress_mode='manual' then g.manual_amount else a.balance end current_amount
    from financial_app.goals g left join account_balances a on a.id=g.account_id where g.active=true
  ), calc as (
    select b.*,
      case when current_amount is null then null else greatest(current_amount,0) end progress_amount,
      case when current_amount is null then null else greatest(target_amount-greatest(current_amount,0),0) end remaining_amount,
      case when current_amount is null then null else greatest(0,least(100,round((greatest(current_amount,0)/target_amount)*100,1))) end progress_percent,
      case when target_date is null then null when target_date<current_date then 0 else greatest(1,ceil((target_date-current_date)::numeric/30.4375)::int) end months_remaining
    from base b
  ), final as (
    select c.*,
      case when current_amount is null then null when remaining_amount<=0 then 0::numeric when target_date is null then null when months_remaining<=0 then remaining_amount else round(remaining_amount/months_remaining,2) end monthly_required,
      case when current_amount is null then 'source_missing' when remaining_amount<=0 then 'achieved' when target_date is not null and target_date<current_date then 'overdue' when target_date is null then 'flexible'
        when (case when months_remaining>0 then remaining_amount/months_remaining else remaining_amount end)>greatest(v_capacity,0) then 'attention' else 'on_track' end goal_status
    from calc c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'type',goal_type,'targetAmount',target_amount,'progressMode',progress_mode,'manualAmount',manual_amount,
      'accountId',account_id,'accountName',account_name,'currentAmount',current_amount,'progressAmount',progress_amount,'balanceDate',balance_date,
      'remainingAmount',remaining_amount,'progressPercent',progress_percent,'targetDate',target_date,'monthsRemaining',months_remaining,'monthlyRequired',monthly_required,
      'priority',priority,'status',goal_status,'notes',notes,'createdAt',created_at,'updatedAt',updated_at)
      order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,target_date nulls last,created_at),'[]'::jsonb),
    jsonb_build_object('activeCount',count(*),'targetTotal',round(coalesce(sum(target_amount),0),2),
      'trackedTotal',round(coalesce(sum(progress_amount) filter(where progress_amount is not null),0),2),
      'remainingTotal',round(coalesce(sum(remaining_amount) filter(where remaining_amount is not null),0),2),
      'monthlyRequired',round(coalesce(sum(monthly_required) filter(where monthly_required is not null),0),2),
      'achievedCount',count(*) filter(where goal_status='achieved'),'attentionCount',count(*) filter(where goal_status='attention'),
      'overdueCount',count(*) filter(where goal_status='overdue'),'sourceMissingCount',count(*) filter(where goal_status='source_missing'))
  into v_goals,v_summary from final;

  return jsonb_build_object('version',financial_app.current_app_version(),'asOf',current_date,'capacityReference',v_capacity,
    'capacityReferenceMethod','3_full_months_cash_flow_average','summary',v_summary,'goals',v_goals,'accounts',v_accounts);
end;$$;

create or replace function financial_app.upsert_goal_core(p_goal_id uuid,p_name text,p_goal_type text,p_target_amount numeric,p_progress_mode text,p_manual_amount numeric,p_account_id uuid,p_target_date date,p_priority text,p_notes text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,financial_app,auth as $$
declare
  v_email text:=financial_app.authorized_email();v_before jsonb;v_row financial_app.goals%rowtype;
  v_name text:=trim(coalesce(p_name,''));v_type text:=lower(trim(coalesce(p_goal_type,'savings')));v_mode text:=lower(trim(coalesce(p_progress_mode,'manual')));v_priority text:=lower(trim(coalesce(p_priority,'medium')));
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_name='' or length(v_name)>120 then raise exception 'invalid_name' using errcode='22023'; end if;
  if v_type not in ('savings','purchase','emergency','custom') then raise exception 'invalid_goal_type' using errcode='22023'; end if;
  if p_target_amount is null or p_target_amount<=0 or p_target_amount>100000000 then raise exception 'invalid_target_amount' using errcode='22023'; end if;
  if v_mode not in ('manual','account') then raise exception 'invalid_progress_mode' using errcode='22023'; end if;
  if v_priority not in ('high','medium','low') then raise exception 'invalid_priority' using errcode='22023'; end if;
  if coalesce(p_manual_amount,0)<0 or coalesce(p_manual_amount,0)>100000000 then raise exception 'invalid_manual_amount' using errcode='22023'; end if;
  if p_target_date is not null and p_target_date<date '2000-01-01' then raise exception 'invalid_target_date' using errcode='22023'; end if;
  if v_mode='account' and (p_account_id is null or not exists(select 1 from financial_app.accounts where id=p_account_id and active=true)) then raise exception 'invalid_account' using errcode='22023'; end if;

  if p_goal_id is null then
    insert into financial_app.goals(name,goal_type,target_amount,progress_mode,manual_amount,account_id,target_date,priority,notes,created_by)
    values(v_name,v_type,round(p_target_amount,2),v_mode,case when v_mode='manual' then round(coalesce(p_manual_amount,0),2) else 0 end,case when v_mode='account' then p_account_id else null end,p_target_date,v_priority,nullif(trim(coalesce(p_notes,'')),''),v_email)
    returning * into v_row;
    insert into financial_app.goal_history(goal_id,action,after_value,changed_by) values(v_row.id,'created',to_jsonb(v_row),v_email);
  else
    select to_jsonb(g) into v_before from financial_app.goals g where g.id=p_goal_id and g.active=true for update;
    if v_before is null then raise exception 'goal_not_found' using errcode='P0002'; end if;
    update financial_app.goals set name=v_name,goal_type=v_type,target_amount=round(p_target_amount,2),progress_mode=v_mode,
      manual_amount=case when v_mode='manual' then round(coalesce(p_manual_amount,0),2) else 0 end,account_id=case when v_mode='account' then p_account_id else null end,
      target_date=p_target_date,priority=v_priority,notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=p_goal_id returning * into v_row;
    insert into financial_app.goal_history(goal_id,action,before_value,after_value,changed_by) values(v_row.id,'updated',v_before,to_jsonb(v_row),v_email);
  end if;
  return jsonb_build_object('ok',true,'goal',to_jsonb(v_row));
end;$$;

create or replace function financial_app.deactivate_goal_core(p_goal_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,financial_app,auth as $$
declare v_email text:=financial_app.authorized_email();v_before jsonb;v_row financial_app.goals%rowtype;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select to_jsonb(g) into v_before from financial_app.goals g where g.id=p_goal_id and g.active=true for update;
  if v_before is null then raise exception 'goal_not_found' using errcode='P0002'; end if;
  update financial_app.goals set active=false,updated_at=now() where id=p_goal_id returning * into v_row;
  insert into financial_app.goal_history(goal_id,action,before_value,after_value,changed_by) values(p_goal_id,'deactivated',v_before,to_jsonb(v_row),v_email);
  return jsonb_build_object('ok',true);
end;$$;

revoke all on function financial_app.goals_overview_core() from public,anon,authenticated;
revoke all on function financial_app.upsert_goal_core(uuid,text,text,numeric,text,numeric,uuid,date,text,text) from public,anon,authenticated;
revoke all on function financial_app.deactivate_goal_core(uuid) from public,anon,authenticated;

create or replace function public.financial_app_goals() returns jsonb language sql stable security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.goals_overview_core();$$;
create or replace function public.financial_app_upsert_goal(p_goal_id uuid,p_name text,p_goal_type text,p_target_amount numeric,p_progress_mode text,p_manual_amount numeric,p_account_id uuid,p_target_date date,p_priority text,p_notes text)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.upsert_goal_core(p_goal_id,p_name,p_goal_type,p_target_amount,p_progress_mode,p_manual_amount,p_account_id,p_target_date,p_priority,p_notes);$$;
create or replace function public.financial_app_deactivate_goal(p_goal_id uuid) returns jsonb language sql volatile security invoker set search_path=pg_catalog,financial_app,auth as $$select financial_app.deactivate_goal_core(p_goal_id);$$;

revoke all on function public.financial_app_goals() from public,anon;
revoke all on function public.financial_app_upsert_goal(uuid,text,text,numeric,text,numeric,uuid,date,text,text) from public,anon;
revoke all on function public.financial_app_deactivate_goal(uuid) from public,anon;
grant execute on function public.financial_app_goals() to authenticated;
grant execute on function public.financial_app_upsert_goal(uuid,text,text,numeric,text,numeric,uuid,date,text,text) to authenticated;
grant execute on function public.financial_app_deactivate_goal(uuid) to authenticated;
