begin;

-- Financial App 3.8.1 — PATCH parcial de Archivo corregido en la capa API.
insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.8.1'::text),now()),
  ('target_version',to_jsonb('3.8.1'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
