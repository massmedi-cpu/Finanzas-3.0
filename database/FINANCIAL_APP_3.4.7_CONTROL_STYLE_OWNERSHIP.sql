begin;

-- Financial App 3.4.7
-- Cierre de propiedad única de controles y tema. No modifica datos ni esquema;
-- alinea únicamente la versión persistida con la entrega de mantenimiento.
insert into financial_app.app_meta(key,value,updated_at) values
  ('app_version',to_jsonb('3.4.7'::text),now()),
  ('target_version',to_jsonb('3.4.7'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
