-- Financial App 9.0.0
-- Retirada del motor histórico de sugerencias de previsión.
--
-- El runtime 9.0.0 consume el modelo canónico de liquidez y calendario.
-- Inicio dejó de renderizar las sugerencias históricas y ya no existe ningún
-- consumidor del helper financial_app.forecast_suggestions_v2(date,date).
--
-- Se conservan deliberadamente financial_app_forecast_liquidity y
-- financial_app_forecast_calendar como contratos canónicos de previsión.
--
-- RESTRICT impide la retirada si aparece cualquier dependencia inesperada.

begin;

drop function if exists financial_app.forecast_suggestions_v2(date,date) restrict;

commit;
