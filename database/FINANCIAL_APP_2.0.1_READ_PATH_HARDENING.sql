-- Financial App 2.0.1 — read-path volatility hardening
--
-- Purpose:
-- - keep every user-facing read path side-effect free;
-- - make PostgreSQL enforce that invariant by marking verified read functions STABLE;
-- - refuse the migration if any curated function contains direct INSERT/UPDATE/DELETE SQL.
--
-- This migration does not change financial data.

do $migration$
declare
  r record;
begin
  for r in
    select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,lower(pg_get_functiondef(p.oid)) as def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='financial_app' and p.proname in (
      'authorized_email',
      'movements_rpc',
      'movements_advanced_core',
      'movements_advanced_enriched_core',
      'movements_advanced_v14_core',
      'movements_advanced_v14_enriched_core',
      'transaction_detail_rpc',
      'transaction_detail_enriched_core',
      'plan_overview_core'
    ))
    or (n.nspname='public' and p.proname in (
      'financial_app_movements',
      'financial_app_movements_advanced',
      'financial_app_movements_advanced_v14',
      'financial_app_transaction_detail',
      'financial_app_rules_overview',
      'financial_app_preview_rule',
      'financial_app_plan_overview'
    ))
  loop
    if r.def ~ '\minsert\s+into\M' or r.def ~ '\mupdate\s+' or r.def ~ '\mdelete\s+from\M' then
      raise exception 'refusing to mark write-capable function %.%(%) stable',r.nspname,r.proname,r.args;
    end if;
    execute format('alter function %I.%I(%s) stable',r.nspname,r.proname,r.args);
  end loop;
end
$migration$;

comment on function financial_app.authorized_email() is
  'Stable authorization lookup for a single request/statement; reads JWT and allowlist only.';
comment on function financial_app.plan_overview_core(date) is
  'Read-only Financial Plan aggregation. Must remain STABLE and side-effect free.';
comment on function public.financial_app_plan_overview(date) is
  'Read-only Financial Plan RPC. Must remain STABLE and side-effect free.';
