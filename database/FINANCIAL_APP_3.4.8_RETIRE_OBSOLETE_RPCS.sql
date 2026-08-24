begin;

-- Financial App 3.4.8
-- Retira contratos sustituidos que ya no forman parte del runtime actual.
-- RESTRICT es deliberado: si aparece una dependencia no inventariada, la migración debe fallar.
drop function if exists public.financial_app_movements(integer,integer,text,uuid,text,text,boolean,date,date,numeric,numeric,text) restrict;
drop function if exists financial_app.movements_rpc(integer,integer,text,uuid,text,text,boolean,date,date,numeric,numeric,text) restrict;

drop function if exists public.financial_app_settings_update(text,jsonb) restrict;
drop function if exists financial_app.settings_update_core(text,jsonb) restrict;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.4.8'::text),now()),
  ('target_version',to_jsonb('3.4.8'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
