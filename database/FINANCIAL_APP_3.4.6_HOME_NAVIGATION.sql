begin;

-- Financial App 3.4.6
-- Cierre de regresión de navegación en Inicio: la política de precarga vuelve
-- a depender exclusivamente del IntentLink canónico ya validado por 2.1.
-- No modifica lógica financiera ni estructura de datos; mantiene únicamente
-- la versión persistida alineada con runtime y build.
insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.4.6'::text),now()),
  ('target_version',to_jsonb('3.4.6'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
