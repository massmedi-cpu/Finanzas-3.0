-- Financial App 9.0.0
-- Retirada del wrapper público de previsión anterior.
--
-- El runtime 9.0.0 usa financial_app_forecast_calendar y
-- financial_app_forecast_liquidity. Inicio también consume ya el modelo
-- canónico de liquidez. Se conserva deliberadamente
-- financial_app.forecast_overview_core(integer), porque Plan y Escenarios
-- internos todavía pueden reutilizar ese cálculo sin exponer este RPC.
--
-- RESTRICT impide la retirada si aparece cualquier dependencia inesperada.

begin;

drop function if exists public.financial_app_forecast_overview(integer) restrict;

commit;
