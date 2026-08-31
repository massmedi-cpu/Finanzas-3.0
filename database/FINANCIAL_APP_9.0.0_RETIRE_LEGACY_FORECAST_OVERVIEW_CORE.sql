-- Financial App 9.0.0
-- Retirada del último motor interno de previsión overview.
--
-- Inicio, Escenarios y Plan ya consumen el forecast canónico de liquidez.
-- No quedan consumidores externos de financial_app.forecast_overview_core(date,integer).
-- RESTRICT impide la retirada si aparece cualquier dependencia inesperada.

begin;

drop function if exists financial_app.forecast_overview_core(date,integer) restrict;

commit;
