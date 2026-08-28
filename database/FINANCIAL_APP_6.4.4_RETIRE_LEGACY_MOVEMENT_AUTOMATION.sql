begin;

-- Financial App 6.4.4 — retirada del runtime de automatización de movimientos 4.0.
-- Evidencia previa: financial_app.automation_runs contiene 0 filas.
-- El flujo v4 duplicaba matching documental con umbrales hardcodeados y no compartía
-- la reversibilidad del lote canónico. La migración histórica 4.0 se conserva en el repo.
do $$
declare
  v_runs bigint:=0;
begin
  if to_regclass('financial_app.automation_runs') is not null then
    execute 'select count(*) from financial_app.automation_runs' into v_runs;
    if v_runs<>0 then
      raise exception 'financial_app_6_4_4_legacy_automation_has_history';
    end if;
  end if;

  if to_regprocedure('public.financial_app_automate_transactions(uuid[])') is not null then
    execute 'revoke all on function public.financial_app_automate_transactions(uuid[]) from public,anon,authenticated,service_role';
  end if;
  if to_regprocedure('financial_app.automate_transactions_core(uuid[])') is not null then
    execute 'revoke all on function financial_app.automate_transactions_core(uuid[]) from public,anon,authenticated,service_role';
  end if;
end
$$;

drop function if exists public.financial_app_automate_transactions(uuid[]);
drop function if exists financial_app.automate_transactions_core(uuid[]);
drop table if exists financial_app.automation_runs;

do $$
begin
  if to_regprocedure('public.financial_app_automate_transactions(uuid[])') is not null
    or to_regprocedure('financial_app.automate_transactions_core(uuid[])') is not null
    or to_regclass('financial_app.automation_runs') is not null then
    raise exception 'financial_app_6_4_4_legacy_automation_retirement_failed';
  end if;
end
$$;

notify pgrst,'reload schema';
commit;
