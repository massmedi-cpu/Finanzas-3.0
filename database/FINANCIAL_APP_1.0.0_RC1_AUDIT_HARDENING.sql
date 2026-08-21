-- Financial App 1.0.0-rc.1 — auditoría integral de seguridad, rendimiento, versionado y divisiones
-- Este archivo consolida las correcciones aplicadas y validadas en Supabase durante la auditoría del 22/08/2026.

-- 1) RLS defensivo en tablas privadas de Financial App.
alter table financial_app.app_meta enable row level security;
alter table financial_app.accounts enable row level security;
alter table financial_app.sync_runs enable row level security;
alter table financial_app.transactions enable row level security;
alter table financial_app.transaction_history enable row level security;
alter table financial_app.transaction_splits enable row level security;
alter table financial_app.budgets enable row level security;
alter table financial_app.documents enable row level security;
alter table financial_app.transaction_documents enable row level security;
alter table financial_app.preferences enable row level security;

revoke all on table financial_app.app_meta from anon, authenticated;
revoke all on table financial_app.accounts from anon, authenticated;
revoke all on table financial_app.sync_runs from anon, authenticated;
revoke all on table financial_app.transactions from anon, authenticated;
revoke all on table financial_app.transaction_history from anon, authenticated;
revoke all on table financial_app.transaction_splits from anon, authenticated;
revoke all on table financial_app.budgets from anon, authenticated;
revoke all on table financial_app.documents from anon, authenticated;
revoke all on table financial_app.transaction_documents from anon, authenticated;
revoke all on table financial_app.preferences from anon, authenticated;

-- 2) Allowlist: evitar reevaluar auth.jwt() por fila.
drop policy if exists financial_app_allowed_user_read_self on financial_app.allowed_users;
create policy financial_app_allowed_user_read_self
on financial_app.allowed_users
for select
to authenticated
using (enabled=true and email=lower(coalesce(((select auth.jwt())->>'email'),'')));

-- 3) Índices: retirar duplicados y cubrir FKs relevantes.
drop index if exists financial_app.idx_transactions_account_date;
drop index if exists financial_app.idx_transactions_date;
drop index if exists financial_app.idx_transactions_status;
create index if not exists account_source_aliases_account_id_idx on financial_app.account_source_aliases(account_id);
create index if not exists transaction_splits_transaction_id_idx on financial_app.transaction_splits(transaction_id);
create index if not exists transactions_last_seen_sync_id_idx on financial_app.transactions(last_seen_sync_id);

-- 4) Ciclo de vida de movimientos nuevos.
update financial_app.transactions
set status='normal'::financial_app.transaction_status, updated_at=now()
where status='new'::financial_app.transaction_status
  and last_seen_sync_id=(select id from financial_app.sync_runs order by started_at asc limit 1);

create or replace function financial_app.mark_new_seen_core(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_count integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  update financial_app.transactions
  set status='normal'::financial_app.transaction_status, updated_at=now()
  where status='new'::financial_app.transaction_status
    and (p_ids is null or id=any(p_ids));
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function financial_app.mark_new_seen_core(uuid[]) from public,anon;
grant execute on function financial_app.mark_new_seen_core(uuid[]) to authenticated,service_role;

create or replace function public.financial_app_mark_new_seen(p_ids uuid[] default null)
returns integer language sql security invoker set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.mark_new_seen_core(p_ids) $$;
revoke all on function public.financial_app_mark_new_seen(uuid[]) from public,anon;
grant execute on function public.financial_app_mark_new_seen(uuid[]) to authenticated,service_role;

-- 5) Permisos RPC auditados.
grant execute on function financial_app.cash_flow_core(integer) to authenticated;
revoke all on function financial_app.resolve_account_from_source(text,text) from public,anon,authenticated;
revoke all on function financial_app.set_transaction_account_from_source() from public,anon,authenticated;
revoke all on function financial_app.set_transaction_derived_flags() from public,anon,authenticated;

-- 6) Versión única centralizada en backend.
insert into financial_app.app_meta(key,value,updated_at)
values('app_version','"1.0.0-rc.1"'::jsonb,now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

create or replace function financial_app.current_app_version()
returns text language sql stable security definer set search_path='pg_catalog','financial_app'
as $$ select coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'1.0.0-rc.1') $$;
revoke all on function financial_app.current_app_version() from public,anon;
grant execute on function financial_app.current_app_version() to authenticated,service_role;

create or replace function public.financial_app_dashboard(p_month date default date_trunc('month',now())::date)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.dashboard_rpc(p_month) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_accounts()
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.accounts_core() || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_account_detail(p_account_id uuid)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.account_detail_core(p_account_id) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_cash_flow(p_year integer default extract(year from now())::integer)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.cash_flow_core(p_year) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_budget_month(p_month date default current_date)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.budget_month_core(p_month) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_forecast_overview(p_start date default current_date,p_days integer default 90)
returns jsonb language sql security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.forecast_overview_core(p_start,p_days) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_net_worth_overview(p_months integer default 18)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.net_worth_overview_core(p_months) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_analysis_overview(p_year integer default extract(year from current_date)::integer)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.analysis_overview_core(p_year) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_archive_overview(p_search text default null,p_limit integer default 100,p_offset integer default 0,p_include_archived boolean default false)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.archive_overview_core(p_search,p_limit,p_offset,p_include_archived) || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_settings_overview()
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.settings_overview_core() || jsonb_build_object('version',financial_app.current_app_version()) $$;
create or replace function public.financial_app_movements(p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,p_type text default null,p_category text default null,p_review_only boolean default false,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,p_max_amount numeric default null,p_sort text default 'date_desc')
returns jsonb language sql security invoker set search_path='pg_catalog','financial_app'
as $$ select financial_app.movements_rpc(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_review_only,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort) || jsonb_build_object('version',financial_app.current_app_version()) $$;

-- 7) Movimientos divididos/compartidos: original inmutable y total cuadrado.
create or replace function financial_app.transaction_splits_core(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_amount numeric; v_splits jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select source_amount into v_amount from financial_app.transactions where id=p_transaction_id;
  if not found then raise exception 'transaction_not_found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'amount',s.amount,'category',s.category,'subcategory',s.subcategory,'beneficiary',s.beneficiary,'isPersonal',s.is_personal,'notes',s.notes,'createdAt',s.created_at,'updatedAt',s.updated_at) order by s.created_at,s.id),'[]'::jsonb)
  into v_splits from financial_app.transaction_splits s where s.transaction_id=p_transaction_id;
  return jsonb_build_object('transactionId',p_transaction_id,'sourceAmount',v_amount,'splitTotal',coalesce((select sum(amount) from financial_app.transaction_splits where transaction_id=p_transaction_id),0),'personalTotal',coalesce((select sum(amount) from financial_app.transaction_splits where transaction_id=p_transaction_id and is_personal),0),'splits',v_splits);
end $$;

create or replace function financial_app.replace_transaction_splits_core(p_transaction_id uuid,p_splits jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_source_amount numeric; v_sum numeric:=0; v_item jsonb; v_amount numeric; v_before jsonb; v_after jsonb; v_count int:=0;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_splits) is distinct from 'array' then raise exception 'invalid_splits'; end if;
  select source_amount into v_source_amount from financial_app.transactions where id=p_transaction_id for update;
  if not found or v_source_amount is null then raise exception 'transaction_not_found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into v_before from financial_app.transaction_splits s where s.transaction_id=p_transaction_id;
  for v_item in select value from jsonb_array_elements(p_splits) loop
    v_count:=v_count+1; if v_count>50 then raise exception 'too_many_splits'; end if;
    begin v_amount:=(v_item->>'amount')::numeric; exception when others then raise exception 'invalid_split_amount'; end;
    if v_amount is null or v_amount=0 then raise exception 'invalid_split_amount'; end if;
    if sign(v_amount)<>sign(v_source_amount) then raise exception 'split_sign_mismatch'; end if;
    v_sum:=v_sum+v_amount;
  end loop;
  if v_count=1 then raise exception 'split_requires_two_parts'; end if;
  if v_count>0 and abs(v_sum-v_source_amount)>.01 then raise exception 'split_total_mismatch: expected %, got %',v_source_amount,v_sum; end if;
  delete from financial_app.transaction_splits where transaction_id=p_transaction_id;
  if v_count>0 then
    insert into financial_app.transaction_splits(transaction_id,amount,category,subcategory,beneficiary,is_personal,notes)
    select p_transaction_id,(x->>'amount')::numeric,nullif(trim(x->>'category'),''),nullif(trim(x->>'subcategory'),''),nullif(trim(x->>'beneficiary'),''),coalesce((x->>'isPersonal')::boolean,true),nullif(trim(x->>'notes'),'')
    from jsonb_array_elements(p_splits) x;
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into v_after from financial_app.transaction_splits s where s.transaction_id=p_transaction_id;
  if v_before is distinct from v_after then
    insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by)
    values(p_transaction_id,'app.splits',to_jsonb(v_source_amount),v_before,v_after,'user_edit',v_email);
  end if;
  return financial_app.transaction_splits_core(p_transaction_id);
end $$;

revoke all on function financial_app.transaction_splits_core(uuid) from public,anon;
revoke all on function financial_app.replace_transaction_splits_core(uuid,jsonb) from public,anon;
grant execute on function financial_app.transaction_splits_core(uuid),financial_app.replace_transaction_splits_core(uuid,jsonb) to authenticated,service_role;

create or replace function public.financial_app_transaction_splits(p_transaction_id uuid)
returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.transaction_splits_core(p_transaction_id) $$;
create or replace function public.financial_app_replace_transaction_splits(p_transaction_id uuid,p_splits jsonb)
returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth'
as $$ select financial_app.replace_transaction_splits_core(p_transaction_id,p_splits) $$;
revoke all on function public.financial_app_transaction_splits(uuid),public.financial_app_replace_transaction_splits(uuid,jsonb) from public,anon;
grant execute on function public.financial_app_transaction_splits(uuid),public.financial_app_replace_transaction_splits(uuid,jsonb) to authenticated,service_role;
