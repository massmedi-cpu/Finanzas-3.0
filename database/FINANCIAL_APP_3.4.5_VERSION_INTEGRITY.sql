begin;

-- Financial App 3.4.5
-- Cierre de integridad de versionado detectado por la auditoría integral.
-- No modifica lógica financiera ni estructura: alinea únicamente la versión
-- persistida de Supabase con el runtime y los manifiestos reproducibles.
insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.4.5'::text),now()),
  ('target_version',to_jsonb('3.4.5'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
