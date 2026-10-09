-- Exact 10.0.102 backup, restored only on the guarded localhost CI service.
-- No copied financial/document rows are printed or edited. Fixtures roll back.
\set ON_ERROR_STOP on
set statement_timeout='90s';
\i :permissions_sql

create temp view aud_function_surface as
select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,
  pg_get_userbyid(p.proowner) as owner,
  coalesce((select jsonb_agg(jsonb_build_object(
    'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege',a.privilege_type,'grantable',a.is_grantable
  ) order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type)
  from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where a.grantee<>p.proowner),'[]'::jsonb) as grants
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app' and p.prokind='f';
create temp table aud_function_originals as select * from aud_function_surface;
create temp table aud_rls_originals as
select c.relname,c.relrowsecurity,c.relforcerowsecurity,
  coalesce((select jsonb_agg(to_jsonb(p) order by p.policyname)
    from pg_policies p where p.schemaname='financial_app' and p.tablename=c.relname),'[]'::jsonb) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='financial_app' and c.relkind in ('r','p');

select 'AUD_RELEASE_STAGE|phase=baseline';
select 'AUD_RELEASE_CATALOG_MISMATCH|object='||e.identity
  from aud_expected_permissions e left join aud_function_originals f on e.identity=f.signature
  where e.kind='FUNCTION' and (f.signature is null or md5(f.definition)<>e.definition_md5 or f.grants<>e.grants);

do $check$
begin
  if exists(select 1 from aud_expected_permissions e
    full join aud_function_originals f on e.kind='FUNCTION' and e.identity=f.signature
    where (e.kind='FUNCTION' or e.kind is null)
      and (f.signature is null or e.identity is null or md5(f.definition)<>e.definition_md5 or f.grants<>e.grants)) then
    raise exception 'AUD_RELEASE_BASELINE_FUNCTION_OR_ACL_MISMATCH';
  end if;
  if exists(select 1 from pg_roles where rolname='financial_app_gateway'
    and (rolsuper or rolbypassrls or rolinherit or rolcanlogin)) then
    raise exception 'AUD_RELEASE_GATEWAY_ROLE_UNSAFE';
  end if;
  if to_regprocedure('financial_app.financial_balance_series(date,date,uuid)') is not null
    or to_regprocedure('financial_app.set_document_test_designation(uuid,boolean,text,boolean)') is not null
    or exists(select 1 from information_schema.columns
      where table_schema='financial_app' and table_name='documents' and column_name='is_test') then
    raise exception 'AUD_RELEASE_BASELINE_ALREADY_MIGRATED';
  end if;
end $check$;

-- Store only digests and original column projections for every business table.
create temp table aud_original_data(table_name text primary key,columns_sql text,fingerprint text);
do $capture$
declare r record; v_columns text; v_fingerprint text;
begin
  for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='financial_app' and c.relkind in ('r','p') order by c.relname loop
    select string_agg(format('%I',a.attname),',' order by a.attnum) into v_columns
    from pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped;
    execute format('select coalesce(md5(string_agg(to_jsonb(q)::text,''|'' order by to_jsonb(q)::text)),md5(''''))
      from (select %s from only financial_app.%I) q',v_columns,r.relname) into v_fingerprint;
    insert into aud_original_data values(r.relname,v_columns,v_fingerprint);
  end loop;
end $capture$;
create function pg_temp.aud_assert_original_data() returns void language plpgsql as $body$
declare r record; v_fingerprint text;
begin
  for r in select * from aud_original_data loop
    execute format('select coalesce(md5(string_agg(to_jsonb(q)::text,''|'' order by to_jsonb(q)::text)),md5(''''))
      from (select %s from only financial_app.%I) q',r.columns_sql,r.table_name) into v_fingerprint;
    if v_fingerprint is distinct from r.fingerprint then raise exception 'AUD_RELEASE_ORIGINAL_DATA_CHANGED'; end if;
  end loop;
end $body$;

-- Keep an executable copy for seven-month parity. The actual function retains
-- its OID and follows CREATE OR REPLACE, exactly as the production migration.
do $baseline$
declare v_definition text;
begin
  select definition into strict v_definition from aud_function_originals
    where signature='financial_app.budget_month_snapshot(text)';
  execute regexp_replace(v_definition,
    '^CREATE OR REPLACE FUNCTION financial_app\.budget_month_snapshot\(',
    'CREATE OR REPLACE FUNCTION financial_app.aud_e2e_budget_month_snapshot_baseline(');
end $baseline$;
revoke all on function financial_app.aud_e2e_budget_month_snapshot_baseline(text) from public,anon,authenticated,service_role;
grant execute on function financial_app.aud_e2e_budget_month_snapshot_baseline(text) to financial_app_gateway;

select 'AUD_RELEASE_STAGE|phase=migrations';
begin;
\i supabase/migrations/20261006160500_qa08_home_balance_series_10_0_89.sql
\i supabase/migrations/20261007165000_qa_work_budget_snapshot_batch.sql
\i supabase/migrations/20261008154928_aud_e2e_document_test_designation.sql
\i supabase/migrations/20261008155833_aud_e2e_category_leaf_permissions.sql
commit;
select pg_temp.aud_assert_original_data();
select 'AUD_RELEASE_STAGE|phase=financial';
\i supabase/tests/aud_e2e_budget_balance.sql
select 'AUD_RELEASE_STAGE|phase=documents';
\i supabase/tests/aud_e2e_document_designation.sql
select pg_temp.aud_assert_original_data();

-- Revert replaced definitions and exact effective function grants. Keep the
-- additive designation columns/constraints so rollback cannot erase provenance.
select 'AUD_RELEASE_STAGE|phase=rollback';
begin;
do $revert$
declare r record; g jsonb;
begin
  for r in select * from aud_function_originals where signature in (
    'financial_app.budget_month_snapshot(text)',
    'financial_app.document_list(text,text,integer,integer)',
    'financial_app.document_detail(uuid)',
    'financial_app.resolve_category_leaf_id(uuid,uuid)',
    'financial_app.category_display_name(uuid)'
  ) loop
    execute r.definition;
    execute format('revoke all on function %s from public,anon,authenticated,service_role,financial_app_gateway',r.signature);
    for g in select value from jsonb_array_elements(r.grants) loop
      execute format('grant %s on function %s to %s%s',g->>'privilege',r.signature,
        case when g->>'role'='PUBLIC' then 'PUBLIC' else quote_ident(g->>'role') end,
        case when (g->>'grantable')::boolean then ' with grant option' else '' end);
    end loop;
  end loop;
end $revert$;
drop function financial_app.set_document_test_designation(uuid,boolean,text,boolean);
drop function financial_app.document_list_filtered(text,text,integer,integer,text,boolean);
drop function financial_app.financial_balance_series(date,date,uuid);
drop function financial_app.aud_e2e_budget_month_snapshot_baseline(text);
commit;
select pg_temp.aud_assert_original_data();

do $verify$
begin
  if exists((select * from aud_function_originals except select * from aud_function_surface)
    union all (select * from aud_function_surface except select * from aud_function_originals)) then
    raise exception 'AUD_RELEASE_FUNCTION_ROLLBACK_MISMATCH';
  end if;
  if exists(select 1 from aud_rls_originals old join pg_class c on c.relname=old.relname
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='financial_app'
    where c.relrowsecurity<>old.relrowsecurity or c.relforcerowsecurity<>old.relforcerowsecurity
      or old.policies<>coalesce((select jsonb_agg(to_jsonb(p) order by p.policyname)
        from pg_policies p where p.schemaname='financial_app' and p.tablename=c.relname),'[]'::jsonb)) then
    raise exception 'AUD_RELEASE_RLS_ROLLBACK_MISMATCH';
  end if;
  if (select count(*) from information_schema.columns where table_schema='financial_app'
    and table_name='documents' and column_name in ('is_test','test_designation_updated_at',
    'test_designation_updated_by','test_designation_reason'))<>4 then
    raise exception 'AUD_RELEASE_ADDITIVE_PROVENANCE_NOT_RETAINED';
  end if;
  if (select count(*) from financial_app.authorized_users)
    +(select count(*) from financial_app.workspace_memberships)
    +(select count(*) from financial_app.google_oauth_connections)
    +(select count(*) from financial_app.workspace_deletion_intents)
    +(select count(*) from financial_app.workspace_deletion_runtime_policy)<>0 then
    raise exception 'AUD_RELEASE_RUNTIME_CONTROL_ROWS';
  end if;
end $verify$;
select 'AUD_RELEASE_STAGE|phase=final';
select 'AUD_RELEASE_DB|status=ok|baseline=10.0.102|migrations=4|rollback_functions=true|rollback_permissions=true|rls_preserved=true|all_original_data_unchanged=true|provenance_columns_retained=true|fixtures_rolled_back=true|production_writes=false' as result;
