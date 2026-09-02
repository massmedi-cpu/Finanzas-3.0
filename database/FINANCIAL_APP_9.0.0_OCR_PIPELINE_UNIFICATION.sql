-- Financial App 9.0.0
-- OCR pipeline unification is an application/runtime release only.
-- This migration intentionally performs no DDL/DML and exists as a versioned
-- release marker proving that the change does not mutate financial source data.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='financial_app_release_preflight'
  ) then
    perform public.financial_app_release_preflight('9.0.0',array[]::text[]);
  end if;
end $$;
