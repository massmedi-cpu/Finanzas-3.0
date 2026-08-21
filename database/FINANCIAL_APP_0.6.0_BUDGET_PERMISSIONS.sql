-- Financial App 0.6.0 — permisos del núcleo privado de Presupuesto.
-- El esquema financial_app no está expuesto por la API; authenticated ya dispone de USAGE
-- y recibe únicamente EXECUTE sobre estas funciones concretas para que los wrappers
-- public SECURITY INVOKER puedan atravesar la capa privada sin exponer tablas.

grant execute on function financial_app.budget_month_core(date) to authenticated;
grant execute on function financial_app.upsert_budget_core(uuid,date,text,text,numeric,boolean,text) to authenticated;
grant execute on function financial_app.deactivate_budget_core(uuid) to authenticated;
