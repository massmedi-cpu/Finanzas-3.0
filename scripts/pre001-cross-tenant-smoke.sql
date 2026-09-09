-- PRE-001 · executable cross-tenant smoke test
-- Run ONLY on a disposable/staging Supabase branch after all PRE-001 migrations.
-- The script is self-cleaning: every mutation is enclosed in one transaction and ends in ROLLBACK.
-- psql-compatible. Any failed invariant aborts the script.

\set ON_ERROR_STOP on

begin;

-- Fixed synthetic workspaces; no dependency on auth.users or Production data.
insert into financial_app.workspaces(id,name)
values
  ('91000000-0000-4000-8000-000000000001'::uuid,'PRE001 tenant A'),
  ('92000000-0000-4000-8000-000000000002'::uuid,'PRE001 tenant B');

-- Structural prerequisites: RLS must be both enabled and forced and the gateway must not bypass it.
do $$
declare
  v_bad_tables text;
  v_super boolean;
  v_bypass boolean;
begin
  select pg_catalog.string_agg(c.relname, ', ' order by c.relname)
    into v_bad_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='financial_app'
    and c.relkind='r'
    and c.relname not in ('schema_meta','authorized_users','workspaces','workspace_memberships')
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if v_bad_tables is not null then
    raise exception 'PRE001_RLS_NOT_FORCED:%', v_bad_tables;
  end if;

  select r.rolsuper,r.rolbypassrls
    into v_super,v_bypass
  from pg_catalog.pg_roles r
  where r.rolname='financial_app_gateway';

  if not found then raise exception 'PRE001_GATEWAY_ROLE_MISSING'; end if;
  if v_super or v_bypass then raise exception 'PRE001_GATEWAY_ROLE_BYPASSES_RLS'; end if;
end
$$;

-- Tenant A owns one account and one root category.
set role financial_app_gateway;
select pg_catalog.set_config('financial_app.workspace_id','91000000-0000-4000-8000-000000000001',false);
select pg_catalog.set_config('financial_app.user_id','93000000-0000-4000-8000-000000000003',false);

insert into financial_app.accounts(
  id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values (
  '91100000-0000-4000-8000-000000000011'::uuid,
  'PRE001 Same Account','Banco A','checking',10000,'EUR','active',0
);

insert into financial_app.categories(
  id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order
) values (
  '91200000-0000-4000-8000-000000000012'::uuid,
  'PRE001 Root A','expense',null,'test','neutral','active',0
);

do $$
declare
  v_accounts integer;
  v_categories integer;
begin
  select count(*)::int into v_accounts from financial_app.accounts;
  select count(*)::int into v_categories from financial_app.categories where id='91200000-0000-4000-8000-000000000012'::uuid;
  if v_accounts <> 1 then raise exception 'PRE001_TENANT_A_ACCOUNT_VISIBILITY_FAILED:%',v_accounts; end if;
  if v_categories <> 1 then raise exception 'PRE001_TENANT_A_CATEGORY_VISIBILITY_FAILED'; end if;
end
$$;

-- Switch the same physical session to tenant B. Tenant A must disappear immediately.
select pg_catalog.set_config('financial_app.workspace_id','92000000-0000-4000-8000-000000000002',false);
select pg_catalog.set_config('financial_app.user_id','94000000-0000-4000-8000-000000000004',false);

do $$
declare
  v_seen integer;
begin
  select count(*)::int into v_seen
  from financial_app.accounts
  where id='91100000-0000-4000-8000-000000000011'::uuid;
  if v_seen <> 0 then raise exception 'PRE001_CROSS_TENANT_READ_LEAK'; end if;
end
$$;

-- The same natural account name is valid in a different workspace: uniqueness is tenant-scoped.
insert into financial_app.accounts(
  id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values (
  '92100000-0000-4000-8000-000000000021'::uuid,
  'PRE001 Same Account','Banco B','checking',20000,'EUR','active',0
);

insert into financial_app.categories(
  id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order
) values (
  '92200000-0000-4000-8000-000000000022'::uuid,
  'PRE001 Root B','expense',null,'test','neutral','active',0
);

do $$
declare
  v_total integer;
  v_a_visible integer;
  v_b_visible integer;
begin
  select count(*)::int into v_total from financial_app.accounts;
  select count(*)::int into v_a_visible from financial_app.accounts where id='91100000-0000-4000-8000-000000000011'::uuid;
  select count(*)::int into v_b_visible from financial_app.accounts where id='92100000-0000-4000-8000-000000000021'::uuid;
  if v_total <> 1 or v_a_visible <> 0 or v_b_visible <> 1 then
    raise exception 'PRE001_TENANT_B_VISIBILITY_FAILED total=% a=% b=%',v_total,v_a_visible,v_b_visible;
  end if;
end
$$;

-- A cross-tenant UPDATE must touch zero rows, not silently modify tenant A.
do $$
declare
  v_rows integer;
begin
  update financial_app.accounts
  set institution='SHOULD NEVER WRITE'
  where id='91100000-0000-4000-8000-000000000011'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'PRE001_CROSS_TENANT_UPDATE_LEAK:%',v_rows; end if;
end
$$;

-- A reference from tenant B to tenant A must fail. Depending on trigger ordering the
-- database may report parent-not-found or a composite-FK violation; success is forbidden.
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into financial_app.categories(
      id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order
    ) values (
      '92300000-0000-4000-8000-000000000023'::uuid,
      'PRE001 illegal cross parent','expense',
      '91200000-0000-4000-8000-000000000012'::uuid,
      'test','neutral','active',1
    );
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'PRE001_CROSS_TENANT_REFERENCE_ACCEPTED'; end if;
end
$$;

-- Switching back to tenant A must restore only A and prove B did not corrupt it.
select pg_catalog.set_config('financial_app.workspace_id','91000000-0000-4000-8000-000000000001',false);
select pg_catalog.set_config('financial_app.user_id','93000000-0000-4000-8000-000000000003',false);

do $$
declare
  v_institution text;
  v_b_visible integer;
begin
  select institution into v_institution
  from financial_app.accounts
  where id='91100000-0000-4000-8000-000000000011'::uuid;
  select count(*)::int into v_b_visible
  from financial_app.accounts
  where id='92100000-0000-4000-8000-000000000021'::uuid;
  if v_institution is distinct from 'Banco A' then raise exception 'PRE001_TENANT_A_WAS_MUTATED:%',v_institution; end if;
  if v_b_visible <> 0 then raise exception 'PRE001_CROSS_TENANT_B_READ_LEAK'; end if;
end
$$;

-- No direct client role may execute the financial schema surface.
reset role;
do $$
declare
  v_leak text;
begin
  select pg_catalog.string_agg(pg_catalog.format('%I(%s)',p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)), ', ')
  into v_leak
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app'
    and (
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')
    );
  if v_leak is not null then raise exception 'PRE001_DIRECT_FUNCTION_EXECUTE_LEAK:%',v_leak; end if;
end
$$;

-- A successful run always leaves the disposable database unchanged.
rollback;

\echo 'PRE001_CROSS_TENANT_SMOKE_OK'
