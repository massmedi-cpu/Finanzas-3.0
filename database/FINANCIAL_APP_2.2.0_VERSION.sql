begin;

insert into financial_app.app_meta(key, value, updated_at)
values
  ('app_version', to_jsonb('2.2.0'::text), now()),
  ('target_version', to_jsonb('2.2.0'::text), now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
