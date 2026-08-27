begin;

-- 5.0 retires the monolithic Home/Dashboard runtime chain replaced by 4.5 home_pulse.
-- RESTRICT is intentional: the migration must fail instead of deleting an unexpected dependent object.
drop function if exists public.financial_app_home_overview() restrict;
drop function if exists public.financial_app_dashboard(date) restrict;
drop function if exists financial_app.home_overview_core() restrict;
drop function if exists financial_app.dashboard_rpc(date) restrict;

do $$
begin
  if to_regprocedure('public.financial_app_home_overview()') is not null
    or to_regprocedure('public.financial_app_dashboard(date)') is not null
    or to_regprocedure('financial_app.home_overview_core()') is not null
    or to_regprocedure('financial_app.dashboard_rpc(date)') is not null then
    raise exception 'architecture_closure_failed';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('5.0.0'::text),now()),
  ('target_version',to_jsonb('5.0.0'::text),now())
on conflict (key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
