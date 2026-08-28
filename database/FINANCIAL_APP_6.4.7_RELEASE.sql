begin;

-- Financial App 6.4.7 · cierre metadata-only de paridad de edición masiva.
-- No añade un segundo motor: la UI reutiliza financial_app_bulk_update_transactions,
-- que delega cada movimiento en update_transaction_rpc y conserva deshacer seguro.
do $$
declare
  v_app_version text;
  v_target_version text;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in ('6.4.6','6.4.7')
    or coalesce(v_target_version,'') not in ('6.4.6','6.4.7') then
    raise exception 'financial_app_6_4_7_requires_6_4_6_baseline';
  end if;

  if to_regprocedure('financial_app.bulk_update_transactions_rpc(uuid[],jsonb)') is null
    or to_regprocedure('public.financial_app_bulk_update_transactions(uuid[],jsonb)') is null
    or to_regprocedure('financial_app.update_transaction_rpc(uuid,jsonb)') is null then
    raise exception 'financial_app_6_4_7_bulk_contract_missing';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.7'::text),now()),
  ('target_version',to_jsonb('6.4.7'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '6.4.7'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_6_4_7_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.7' and target_version='6.4.7'
  ) then
    raise exception 'financial_app_6_4_7_manifest_alignment_failed';
  end if;
end
$$;

commit;
