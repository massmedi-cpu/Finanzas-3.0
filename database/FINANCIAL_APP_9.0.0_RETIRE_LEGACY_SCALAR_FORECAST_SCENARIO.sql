-- Financial App 9.0.0
-- Retirada de la sobrecarga escalar histórica de Escenarios.
--
-- El runtime 9.0.0 usa exclusivamente financial_app_forecast_scenario
-- con la firma (date,integer,jsonb), que delega en el core canónico basado
-- en forecast_liquidity_core. La firma escalar anterior mantenía un segundo
-- motor paralelo basado en forecast_overview_core y ya no tiene consumidores.
--
-- Se elimina primero el wrapper público y después su core privado gemelo.
-- RESTRICT impide la retirada si aparece cualquier dependencia inesperada.

begin;

drop function if exists public.financial_app_forecast_scenario(date,integer,text,numeric,date,text,integer,integer) restrict;
drop function if exists financial_app.forecast_scenario_core(date,integer,text,numeric,date,text,integer,integer) restrict;

commit;
