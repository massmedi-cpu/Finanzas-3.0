-- Financial App 9.0.0
-- Endurece la frontera pública del ciclo de Archivo.
-- La página /archivo exige usuario autorizado y el core privado ya rechaza anon.
-- Este wrapper no necesita EXECUTE anónimo: se mantiene solo para sesiones autenticadas y service_role.

begin;

revoke all on function public.financial_app_archive_lifecycle_overview(text,text,integer,integer) from public;
revoke all on function public.financial_app_archive_lifecycle_overview(text,text,integer,integer) from anon;
grant execute on function public.financial_app_archive_lifecycle_overview(text,text,integer,integer) to authenticated, service_role;

commit;
