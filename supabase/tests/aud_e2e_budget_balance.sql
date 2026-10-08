-- AUD-E2E-PTO-001 / INI-001. Run only through the disposable CI runner.
-- Every fixture, including its immutable bank source, is synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '90s';

insert into financial_app.workspaces(id,name) values
  ('a0d00000-0000-4000-8000-000000000001','AUD synthetic A'),
  ('a0d00000-0000-4000-8000-000000000002','AUD synthetic B');
select pg_catalog.set_config('financial_app.workspace_id','a0d00000-0000-4000-8000-000000000001',true);
set local role financial_app_gateway;

create temp table aud_ids(key text primary key,id uuid not null) on commit drop;
with inserted as (
  insert into financial_app.accounts(name,type,opening_balance_cents) values
    ('AUD bank explicit','checking',2000000),('AUD valid zero','checking',0)
  returning id,name
)
insert into aud_ids select case name when 'AUD bank explicit' then 'account' else 'zero_account' end,id from inserted;

with inserted as (
  insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order) values
    ('AUD Root','expense','test','neutral','active',1),
    ('AUD Food','expense','test','neutral','active',2),
    ('AUD Archived','expense','test','neutral','archived',3)
  returning id,name
)
insert into aud_ids select name,id from inserted;
with inserted as (
  insert into financial_app.categories(name,kind,parent_category_id,icon_key,color_token,sort_order)
  values('AUD Child','expense',(select id from aud_ids where key='AUD Root'),'test','neutral',4)
  returning id
)
insert into aud_ids select 'AUD Child',id from inserted;

create temp table aud_fixtures(
  key text primary key, bank_date date not null, amount_cents bigint not null,
  kind text not null, category_id uuid, duplicate_state text not null default 'none',
  excluded boolean not null default false, balance_after_cents bigint
) on commit drop;
insert into aud_fixtures(key,bank_date,amount_cents,kind,category_id,balance_after_cents)
select 'basic-'||to_char(m,'YYYY-MM'),m::date+10,
  case when to_char(m,'YYYY-MM')='2025-12' then -100000 else -1000-(ordinality%6)*100 end,
  'expense',(select id from aud_ids where key='AUD Root'),null
from generate_series(date '2023-10-01',date '2026-10-01',interval '1 month') with ordinality as months(m,ordinality);
insert into aud_fixtures(key,bank_date,amount_cents,kind,category_id,balance_after_cents)
select 'split-'||to_char(m,'YYYY-MM'),m::date+15,-10000,'expense',
  (select id from aud_ids where key='AUD Root'),
  case when m>=date '2026-09-01' then 0 else 250000-ordinality*1000 end
from generate_series(date '2023-10-01',date '2026-10-01',interval '1 month') with ordinality as months(m,ordinality);
insert into aud_fixtures(key,bank_date,amount_cents,kind,category_id,duplicate_state,excluded) values
  ('duplicate','2026-10-03',-99000,'expense',(select id from aud_ids where key='AUD Child'),'confirmed',false),
  ('excluded','2026-10-04',-88000,'expense',(select id from aud_ids where key='AUD Child'),'none',true),
  ('transfer','2026-10-05',-1200,'transfer',null,'none',false),
  ('refund','2026-10-06',700,'refund',(select id from aud_ids where key='AUD Child'),'none',false),
  ('income','2026-10-07',90000,'income',null,'none',false);

with source as (
  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
    source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  )
  select '__aud_e2e_disposable__','synthetic',key,'__aud_e2e_disposable__::'||key,
    md5(key)||md5('synthetic:'||key),'{"synthetic":true,"scope":"disposable"}'::jsonb,
    bank_date,key,amount_cents,balance_after_cents,'aud-account'
  from aud_fixtures returning id,source_row_key
), inserted as (
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
    category_id,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  )
  select s.id,'__aud_e2e_disposable__::'||f.key,(select id from aud_ids where key='account'),
    f.bank_date,f.key,f.category_id,f.kind,f.amount_cents,f.balance_after_cents,'confirmed',f.duplicate_state
  from source s join aud_fixtures f on f.key=s.source_row_key
  returning id,concept_normalized
)
insert into aud_ids select concept_normalized,id from inserted;

insert into financial_app.transaction_overrides(transaction_id,excluded_from_analytics)
select id,true from aud_ids where key='excluded';
insert into financial_app.transaction_split_allocations(
  transaction_id,position,allocation_scope,amount_cents,source_amount_cents,category_id
)
select t.id,line.position,line.scope,line.amount,-10000,
  case line.position when 0 then (select id from aud_ids where key='AUD Child')
    when 1 then (select id from aud_ids where key='AUD Food') else null end
from aud_ids t cross join (values(0,'personal',-3000),(1,'personal',-2000),(2,'other',-5000)) as line(position,scope,amount)
where t.key like 'split-%';
set constraints all immediate;

insert into financial_app.recurrences(
  category_id,concept_pattern,status,interval_unit,interval_count,usual_amount_cents,next_estimated_date
) values
  ((select id from aud_ids where key='AUD Child'),'AUD active floor','active','month',1,-8000,'2026-09-05'),
  ((select id from aud_ids where key='AUD Child'),'AUD archived ignored','archived','month',1,-45000,'2026-09-05');
insert into financial_app.budgets(month,category_id,automatic_amount_cents,manual_amount_cents) values
  ('2026-09',null,12345,0),
  ('2026-10',(select id from aud_ids where key='AUD Food'),12345,0),
  ('2026-10',(select id from aud_ids where key='AUD Archived'),12345,5000);

-- Fingerprint all financially relevant records visible to the restricted role.
create temp view aud_read_state as
select md5(jsonb_build_object(
  'source',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.transaction_source_records t),
  'transactions',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.transactions t),
  'splits',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.transaction_split_allocations t),
  'overrides',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.transaction_overrides t),
  'budgets',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.budgets t),
  'recurrences',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.recurrences t),
  'accounts',(select jsonb_agg(to_jsonb(t) order by id) from financial_app.accounts t)
)::text) as fingerprint;
create temp table aud_before on commit drop as select * from aud_read_state;

do $$
declare
  v_month text;
  v_old jsonb;
  v_new jsonb;
  v_series jsonb;
  v_row jsonb;
  v_snapshot jsonb;
  v_item jsonb;
begin
  foreach v_month in array array['2022-11','2023-10','2024-10','2025-12','2026-08','2026-09','2026-10'] loop
    v_old := financial_app.aud_e2e_budget_month_snapshot_baseline(v_month);
    v_new := financial_app.budget_month_snapshot(v_month);
    if v_old is distinct from v_new then
      raise exception 'AUD_BUDGET_PARITY_FAILED month=% baseline=% candidate=%',v_month,v_old,v_new;
    end if;
    raise notice 'AUD_E2E_DB|budget_json_parity=%|categories=%',v_month,jsonb_array_length(v_new->'categories');
  end loop;

  v_new := financial_app.budget_month_snapshot('2026-10');
  if (v_new->'total'->>'actualExpenseCents')::bigint <> 6100 then
    raise exception 'AUD_SPLIT_TOTAL_OR_EXCLUSIONS_FAILED';
  end if;
  select item into v_item from jsonb_array_elements(v_new->'categories') item
  where item->>'categoryId'=(select id::text from aud_ids where key='AUD Root');
  if (v_item->>'actualExpenseCents')::bigint <> 4100 then raise exception 'AUD_DESCENDANTS_FAILED'; end if;
  if (v_item->'automaticFactors'->>'knownRecurringCents')::bigint <> 8000 then raise exception 'AUD_RECURRENCE_FLOOR_FAILED'; end if;
  select item into v_item from jsonb_array_elements(v_new->'categories') item
  where item->>'categoryId'=(select id::text from aud_ids where key='AUD Food');
  if (v_item->>'actualExpenseCents')::bigint <> 2000 or (v_item->>'effectiveAmountCents')::bigint <> 0
    or v_item->>'status'<>'unfunded' then raise exception 'AUD_MANUAL_ZERO_FAILED'; end if;
  select item into v_item from jsonb_array_elements(v_new->'categories') item
  where item->>'categoryId'=(select id::text from aud_ids where key='AUD Archived');
  if v_item is null or (v_item->>'effectiveAmountCents')::bigint<>5000 then raise exception 'AUD_ARCHIVED_MANUAL_FAILED'; end if;

  v_series := financial_app.financial_balance_series('2026-07-15','2026-10-18',null);
  if jsonb_array_length(v_series->'rows')<>4 or v_series->'principles'<>jsonb_build_object(
    'bankSource','read_only','balanceSource','financial_account_balances','cashFlowReconstruction',false,'getHasSideEffects',false
  ) then raise exception 'AUD_BALANCE_CONTRACT_FAILED'; end if;
  for v_row in select item from jsonb_array_elements(v_series->'rows') item loop
    v_snapshot := financial_app.financial_account_balances((v_row->>'asOfDate')::date,false,null);
    if (v_row->>'balanceCents')::bigint<>(v_snapshot->>'activeBalanceCents')::bigint
      or (v_row->>'accounts')::int<>(v_snapshot->'quality'->>'accounts')::int
      or (v_row->>'explicitBalanceAccounts')::int<>(v_snapshot->'quality'->>'explicitBalanceAccounts')::int
      or (v_row->>'reconstructedBalanceAccounts')::int<>(v_snapshot->'quality'->>'reconstructedBalanceAccounts')::int then
      raise exception 'AUD_BALANCE_CANONICAL_PARITY_FAILED:%',v_row;
    end if;
  end loop;
  v_row := v_series->'rows'->3;
  if v_row->>'asOfDate'<>'2026-10-18' or (v_row->>'balanceCents')::bigint<>0
    or (v_row->>'explicitBalanceAccounts')::int<>1 or (v_row->>'reconstructedBalanceAccounts')::int<>1 then
    raise exception 'AUD_BALANCE_VALID_ZERO_FAILED:%',v_row;
  end if;
  begin
    perform financial_app.financial_balance_series('2026-10-18','2026-07-15',null);
    raise exception 'AUD_INVALID_RANGE_ACCEPTED';
  exception when others then
    if sqlerrm<>'invalid_financial_balance_series_range' then raise; end if;
  end;
end $$;

-- The second workspace has no financial history: it must not inherit A's data.
select pg_catalog.set_config('financial_app.workspace_id','a0d00000-0000-4000-8000-000000000002',true);
insert into financial_app.accounts(name,type,opening_balance_cents) values('AUD bank explicit','checking',999999);
do $$
declare v_budget jsonb; v_series jsonb;
begin
  v_budget:=financial_app.budget_month_snapshot('2026-10');
  v_series:=financial_app.financial_balance_series('2026-10-01','2026-10-18',null);
  if jsonb_array_length(v_budget->'categories')<>0 or (v_budget->'total'->>'actualExpenseCents')::bigint<>0
    or (v_budget->'total'->>'automaticAmountCents')::bigint<>0 then raise exception 'AUD_BUDGET_TENANT_LEAK'; end if;
  if (v_series->'rows'->0->>'balanceCents')::bigint<>999999 or (v_series->'rows'->0->>'accounts')::int<>1 then
    raise exception 'AUD_BALANCE_TENANT_LEAK';
  end if;
  begin
    perform financial_app.financial_balance_series('2026-10-01','2026-10-18',(select id from aud_ids where key='account'));
    raise exception 'AUD_FOREIGN_ACCOUNT_ACCEPTED';
  exception when others then
    if sqlerrm<>'financial_account_not_found' then raise; end if;
  end;
end $$;

select pg_catalog.set_config('financial_app.workspace_id','a0d00000-0000-4000-8000-000000000001',true);
do $$
begin
  if (select fingerprint from aud_before) is distinct from (select fingerprint from aud_read_state) then
    raise exception 'AUD_FINANCIAL_READ_HAS_SIDE_EFFECTS';
  end if;
end $$;
reset role;
do $$
declare v_function text; v_oid oid;
begin
  foreach v_function in array array['financial_app.budget_month_snapshot(text)','financial_app.financial_balance_series(date,date,uuid)'] loop
    v_oid:=v_function::regprocedure::oid;
    if (select prosecdef or provolatile<>'s' from pg_catalog.pg_proc where oid=v_oid)
      or not pg_catalog.has_function_privilege('financial_app_gateway',v_oid,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then
      raise exception 'AUD_FINANCIAL_FUNCTION_PRIVILEGES_FAILED:%',v_function;
    end if;
  end loop;
end $$;
rollback;
select 'AUD_E2E_BUDGET_BALANCE_OK: seven_month_json_parity, split_personal_scope, descendants, manual_zero, archived_budget, recurrence_floor, balance_canonical_parity, valid_zero, tenant_isolation, read_only, restricted_invoker' as result;
