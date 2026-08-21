-- Financial App 0.8.0 · Patrimonio real
-- Estado consolidado reproducible. No inserta activos ni deudas del usuario.

create table if not exists financial_app.net_worth_items(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  item_type text not null check(item_type in('asset','liability')),
  category text,
  current_value numeric not null check(current_value>=0),
  valuation_date date not null,
  include_in_total boolean not null default true,
  notes text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists net_worth_items_type_active_idx on financial_app.net_worth_items(item_type,active);

create table if not exists financial_app.net_worth_history(
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references financial_app.net_worth_items(id) on delete cascade,
  value numeric not null check(value>=0),
  valuation_date date not null,
  action text not null check(action in('create','update','deactivate','reactivate')),
  item_type text check(item_type in('asset','liability')),
  include_in_total boolean,
  notes text,
  changed_by text,
  created_at timestamptz not null default now()
);
alter table financial_app.net_worth_history add column if not exists item_type text check(item_type in('asset','liability'));
alter table financial_app.net_worth_history add column if not exists include_in_total boolean;
create index if not exists net_worth_history_item_date_idx on financial_app.net_worth_history(item_id,valuation_date desc,created_at desc);

alter table financial_app.net_worth_items enable row level security;
alter table financial_app.net_worth_history enable row level security;
revoke all on financial_app.net_worth_items from anon,authenticated;
revoke all on financial_app.net_worth_history from anon,authenticated;

create or replace function financial_app.upsert_net_worth_item_core(
  p_id uuid,p_name text,p_item_type text,p_category text,p_value numeric,p_valuation_date date,p_include boolean default true,p_notes text default null
) returns uuid language plpgsql volatile security definer set search_path='pg_catalog','financial_app','auth' as $$
declare v_email text;v_id uuid;v_before financial_app.net_worth_items%rowtype;v_action text;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  if nullif(trim(p_name),'') is null then raise exception 'name required';end if;
  if p_item_type not in('asset','liability') then raise exception 'invalid item type';end if;
  if p_value is null or p_value<0 then raise exception 'invalid value';end if;
  if p_valuation_date is null or p_valuation_date>current_date+1 then raise exception 'invalid valuation date';end if;
  if p_id is null then
    insert into financial_app.net_worth_items(name,item_type,category,current_value,valuation_date,include_in_total,notes,created_by)
    values(trim(p_name),p_item_type,nullif(trim(p_category),''),p_value,p_valuation_date,coalesce(p_include,true),nullif(trim(p_notes),''),v_email)
    returning id into v_id;
    insert into financial_app.net_worth_history(item_id,value,valuation_date,action,item_type,include_in_total,notes,changed_by)
    values(v_id,p_value,p_valuation_date,'create',p_item_type,coalesce(p_include,true),nullif(trim(p_notes),''),v_email);
  else
    select * into v_before from financial_app.net_worth_items where id=p_id;
    if not found then raise exception 'item not found';end if;
    update financial_app.net_worth_items set name=trim(p_name),item_type=p_item_type,category=nullif(trim(p_category),''),current_value=p_value,valuation_date=p_valuation_date,include_in_total=coalesce(p_include,true),notes=nullif(trim(p_notes),''),active=true,updated_at=now() where id=p_id returning id into v_id;
    v_action:=case when v_before.active then 'update' else 'reactivate' end;
    if v_before.current_value is distinct from p_value or v_before.valuation_date is distinct from p_valuation_date or v_before.item_type is distinct from p_item_type or v_before.include_in_total is distinct from coalesce(p_include,true) or v_before.active=false then
      insert into financial_app.net_worth_history(item_id,value,valuation_date,action,item_type,include_in_total,notes,changed_by)
      values(v_id,p_value,p_valuation_date,v_action,p_item_type,coalesce(p_include,true),nullif(trim(p_notes),''),v_email);
    end if;
  end if;
  return v_id;
end $$;

create or replace function financial_app.deactivate_net_worth_item_core(p_id uuid) returns boolean language plpgsql volatile security definer set search_path='pg_catalog','financial_app','auth' as $$
declare v_email text;v_item financial_app.net_worth_items%rowtype;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  select * into v_item from financial_app.net_worth_items where id=p_id;
  if not found then raise exception 'item not found';end if;
  if v_item.active then
    update financial_app.net_worth_items set active=false,updated_at=now() where id=p_id;
    insert into financial_app.net_worth_history(item_id,value,valuation_date,action,item_type,include_in_total,notes,changed_by)
    values(p_id,v_item.current_value,current_date,'deactivate',v_item.item_type,v_item.include_in_total,v_item.notes,v_email);
  end if;
  return true;
end $$;

revoke all on function financial_app.upsert_net_worth_item_core(uuid,text,text,text,numeric,date,boolean,text) from public,anon;
revoke all on function financial_app.deactivate_net_worth_item_core(uuid) from public,anon;
grant execute on function financial_app.upsert_net_worth_item_core(uuid,text,text,text,numeric,date,boolean,text) to authenticated;
grant execute on function financial_app.deactivate_net_worth_item_core(uuid) to authenticated;

create or replace function public.financial_app_upsert_net_worth_item(p_id uuid,p_name text,p_item_type text,p_category text,p_value numeric,p_valuation_date date,p_include boolean default true,p_notes text default null) returns uuid
language sql volatile security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.upsert_net_worth_item_core(p_id,p_name,p_item_type,p_category,p_value,p_valuation_date,p_include,p_notes)$$;
create or replace function public.financial_app_deactivate_net_worth_item(p_id uuid) returns boolean
language sql volatile security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.deactivate_net_worth_item_core(p_id)$$;
revoke all on function public.financial_app_upsert_net_worth_item(uuid,text,text,text,numeric,date,boolean,text) from public,anon;
revoke all on function public.financial_app_deactivate_net_worth_item(uuid) from public,anon;
grant execute on function public.financial_app_upsert_net_worth_item(uuid,text,text,text,numeric,date,boolean,text) to authenticated;
grant execute on function public.financial_app_deactivate_net_worth_item(uuid) to authenticated;

create or replace function financial_app.net_worth_overview_core(p_months integer default 18) returns jsonb
language plpgsql stable security definer set search_path='pg_catalog','financial_app','auth' as $$
declare
  v_email text;v_bank_items jsonb:='[]'::jsonb;v_manual_items jsonb:='[]'::jsonb;v_history jsonb:='[]'::jsonb;
  v_bank_assets numeric:=0;v_bank_liabilities numeric:=0;v_manual_assets numeric:=0;v_manual_liabilities numeric:=0;
  v_total_assets numeric:=0;v_total_liabilities numeric:=0;v_net numeric:=0;v_forecast_impact numeric:=0;v_projected numeric:=0;
  v_known_accounts int:=0;v_account_count int:=0;v_first_complete numeric;v_change numeric:=0;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  p_months:=greatest(6,least(coalesce(p_months,18),60));
  with account_balances as(
    select a.id,a.name,a.external_identifier,a.account_role,a.cash_flow_enabled,b.balance,b.balance_date
    from financial_app.accounts a left join lateral(
      select t.source_balance balance,t.source_date balance_date from financial_app.transactions t
      where t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null
      order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
    )b on true where a.active=true
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind','bank','name',name,'identifier',external_identifier,'role',account_role,'balance',balance,'balanceDate',balance_date,'automatic',true) order by case when account_role='operating' then 0 when account_role='savings' then 1 else 2 end,name),'[]'::jsonb),
    coalesce(sum(greatest(coalesce(balance,0),0)),0),coalesce(sum(greatest(-coalesce(balance,0),0)),0),count(*) filter(where balance is not null),count(*)
  into v_bank_items,v_bank_assets,v_bank_liabilities,v_known_accounts,v_account_count from account_balances;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind','manual','name',name,'itemType',item_type,'category',category,'value',current_value,'valuationDate',valuation_date,'includeInTotal',include_in_total,'notes',notes,'active',active) order by item_type,name),'[]'::jsonb),
    coalesce(sum(current_value) filter(where active and include_in_total and item_type='asset'),0),coalesce(sum(current_value) filter(where active and include_in_total and item_type='liability'),0)
  into v_manual_items,v_manual_assets,v_manual_liabilities from financial_app.net_worth_items;
  v_total_assets:=v_bank_assets+v_manual_assets;v_total_liabilities:=v_bank_liabilities+v_manual_liabilities;v_net:=v_total_assets-v_total_liabilities;
  select coalesce(sum(o.predicted_amount),0) into v_forecast_impact from financial_app.forecast_occurrences o join financial_app.forecasts f on f.id=o.forecast_id where o.status='pending' and o.occurrence_date>current_date and o.occurrence_date<=current_date+90 and f.status<>'cancelled'::financial_app.forecast_status;
  v_projected:=v_net+v_forecast_impact;
  with months as(select generate_series(date_trunc('month',current_date)-(p_months-1)*interval '1 month',date_trunc('month',current_date),interval '1 month')::date month_start),
  bank_month as(
    select m.month_start,count(*) filter(where x.balance is not null) known_accounts,count(*) account_count,coalesce(sum(x.balance) filter(where x.balance is not null),0) bank_net
    from months m cross join financial_app.accounts a left join lateral(
      select t.source_balance balance from financial_app.transactions t where a.active=true and t.source_identifier=a.external_identifier and t.source_missing=false and t.source_balance is not null and t.source_date<(m.month_start+interval '1 month')::date order by t.source_date desc nulls last,t.source_time desc nulls last,t.source_id desc limit 1
    )x on true where a.active=true group by m.month_start
  ), manual_month as(
    select m.month_start,coalesce(sum(case when h.action='deactivate' or coalesce(h.include_in_total,true)=false then 0 when h.item_type='liability' then -h.value else h.value end),0) manual_net
    from months m left join financial_app.net_worth_items i on true left join lateral(
      select h.* from financial_app.net_worth_history h where h.item_id=i.id and h.valuation_date<(m.month_start+interval '1 month')::date order by h.valuation_date desc,h.created_at desc limit 1
    )h on true group by m.month_start
  ),points as(
    select b.month_start,b.known_accounts,b.account_count,b.bank_net,coalesce(mm.manual_net,0) manual_net,case when b.known_accounts=b.account_count then b.bank_net+coalesce(mm.manual_net,0) else null end net_worth,b.known_accounts=b.account_count complete from bank_month b join manual_month mm using(month_start)
  )
  select coalesce(jsonb_agg(jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'bankNet',round(bank_net,2),'manualNet',round(manual_net,2),'netWorth',case when net_worth is null then null else round(net_worth,2) end,'complete',complete,'knownAccounts',known_accounts,'accountCount',account_count) order by month_start),'[]'::jsonb),(array_agg(net_worth order by month_start) filter(where net_worth is not null))[1]
  into v_history,v_first_complete from points;
  if v_first_complete is not null and v_first_complete<>0 then v_change:=round(((v_net-v_first_complete)/abs(v_first_complete)*100)::numeric,2);end if;
  return jsonb_build_object('version','0.8.0','asOf',current_date,'assets',round(v_total_assets,2),'liabilities',round(v_total_liabilities,2),'netWorth',round(v_net,2),'bankAssets',round(v_bank_assets,2),'manualAssets',round(v_manual_assets,2),'manualLiabilities',round(v_manual_liabilities,2),'forecastImpact90',round(v_forecast_impact,2),'projectedNetWorth90',round(v_projected,2),'changeFromFirstCompletePercent',v_change,'bankItems',v_bank_items,'manualItems',v_manual_items,'history',v_history,'coverage',jsonb_build_object('knownAccounts',v_known_accounts,'accountCount',v_account_count,'currentComplete',v_known_accounts=v_account_count),'rules',jsonb_build_object('manualItemsRequireUserAction',true,'forecastUsesSavedOnly',true,'suggestionsAffectProjection',false,'incompleteHistoricalMonthsAreNull',true));
end $$;
revoke all on function financial_app.net_worth_overview_core(integer) from public,anon;
grant execute on function financial_app.net_worth_overview_core(integer) to authenticated;
create or replace function public.financial_app_net_worth_overview(p_months integer default 18) returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.net_worth_overview_core(p_months)$$;
revoke all on function public.financial_app_net_worth_overview(integer) from public,anon;
grant execute on function public.financial_app_net_worth_overview(integer) to authenticated;

insert into financial_app.app_meta(key,value) values('schema_version','"0.8.0"'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();
