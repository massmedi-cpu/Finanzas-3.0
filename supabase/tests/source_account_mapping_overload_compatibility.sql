begin;

do $$
declare
  v_legacy_id uuid;
  v_archived_id uuid;
begin
  v_legacy_id := financial_app.ensure_source_account_mapping(
    '__phase2_overload_legacy__',
    'Cuenta legacy regression',
    'Cuenta legacy regression',
    'Banco prueba',
    'checking',
    0,
    '****0097'
  );

  if (select lifecycle from financial_app.accounts where id=v_legacy_id) <> 'active' then
    raise exception 'legacy_7_arg_mapping_not_active';
  end if;

  v_archived_id := financial_app.ensure_source_account_mapping(
    '__phase2_overload_lifecycle__',
    'Tarjeta prepago Openbank · 8403',
    'Tarjeta prepago Openbank · 8403',
    'Openbank',
    'other',
    0,
    'archived',
    '****8403'
  );

  if (select lifecycle from financial_app.accounts where id=v_archived_id) <> 'archived' then
    raise exception 'lifecycle_8_arg_mapping_not_archived';
  end if;

  if (select type from financial_app.accounts where id=v_archived_id) <> 'other' then
    raise exception 'lifecycle_8_arg_mapping_type_mismatch';
  end if;
end $$;

rollback;
