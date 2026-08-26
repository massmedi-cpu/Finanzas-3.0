begin;

-- Financial App 3.9.0 · alineación de versión tras cerrar el workbench de conciliación.
insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.9.0'::text),now()),
  ('target_version',to_jsonb('3.9.0'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
