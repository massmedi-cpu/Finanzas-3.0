begin;

-- Financial App 6.4.5 · cierre de compatibilidad de nombres de Drive.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_document_date date;
  v_amount numeric;
  v_merchant text;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in ('6.4.4','6.4.5')
    or coalesce(v_target_version,'') not in ('6.4.4','6.4.5') then
    raise exception 'financial_app_6_4_5_requires_6_4_4_baseline';
  end if;

  if to_regprocedure('financial_app.drive_document_rows(jsonb)') is null then
    raise exception 'financial_app_6_4_5_drive_parser_missing';
  end if;

  select document_date,amount,merchant
    into v_document_date,v_amount,v_merchant
  from financial_app.drive_document_rows(
    jsonb_build_array(
      jsonb_build_object(
        'id','financial-app-v645-regression',
        'name','20250826 Mercadona 23,49 €.pdf',
        'mimeType','application/pdf',
        'modifiedTime','2026-08-28T00:00:00Z',
        'folderPath','Compras_y_facturas/Compras/Supermercado',
        'documentType','receipt',
        'documentDate',null,
        'amount',null,
        'merchant','Supermercado'
      )
    )
  );

  if v_document_date is distinct from date '2025-08-26'
    or v_amount is distinct from 23.49::numeric
    or v_merchant is distinct from 'Mercadona' then
    raise exception 'financial_app_6_4_5_compact_drive_filename_regression';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.5'::text),now()),
  ('target_version',to_jsonb('6.4.5'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '6.4.5'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_6_4_5_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.5' and target_version='6.4.5'
  ) then
    raise exception 'financial_app_6_4_5_manifest_alignment_failed';
  end if;
end
$$;

commit;
