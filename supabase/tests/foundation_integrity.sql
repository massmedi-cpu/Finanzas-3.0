begin;

do $$
declare
  account_id uuid;
  root_category_id uuid;
  child_category_id uuid;
  first_source_id uuid;
  second_source_id uuid;
  transaction_id uuid;
  blocked boolean;
  meta_ok boolean;
begin
  select exists (
    select 1
    from financial_app.schema_meta
    where id = true
      and schema_version = 2
      and app_version = '0.0.1'
      and target_version = '10.0.0'
      and bank_source_policy = 'read_only'
      and locale = 'es-ES'
      and currency = 'EUR'
      and time_zone = 'Europe/Madrid'
  ) into meta_ok;

  if not meta_ok then
    raise exception 'foundation schema metadata is invalid';
  end if;

  insert into financial_app.accounts (
    name, institution, type, opening_balance_cents, currency, lifecycle, sort_order
  ) values (
    'Cuenta principal', 'Banco de prueba', 'checking', 100000, 'EUR', 'active', 0
  ) returning id into account_id;

  blocked := false;
  begin
    insert into financial_app.accounts (
      name, institution, type, opening_balance_cents, currency, lifecycle, sort_order
    ) values (
      '  CUENTA   PRINCIPAL ', null, 'savings', 0, 'EUR', 'active', 1
    );
  exception when unique_violation then
    blocked := true;
  end;

  if not blocked then
    raise exception 'normalized duplicate account name was accepted';
  end if;

  insert into financial_app.categories (
    name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
  ) values (
    'Hogar', 'expense', null, 'home', 'category.home', 'active', 0
  ) returning id into root_category_id;

  insert into financial_app.categories (
    name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
  ) values (
    'Suministros', 'expense', root_category_id, 'utilities', 'category.utilities', 'active', 1
  ) returning id into child_category_id;

  blocked := false;
  begin
    insert into financial_app.categories (
      name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
    ) values (
      'Ingreso inválido', 'income', root_category_id, 'income', 'category.income', 'active', 0
    );
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'category parent with incompatible kind was accepted';
  end if;

  blocked := false;
  begin
    update financial_app.categories
    set parent_category_id = child_category_id
    where id = root_category_id;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'category hierarchy cycle was accepted';
  end if;

  insert into financial_app.transaction_source_records (
    source_file_id,
    source_sheet_id,
    source_row_key,
    source_row_identity,
    source_fingerprint,
    supersedes_source_record_id,
    source_payload,
    bank_date,
    concept_original,
    amount_cents,
    balance_after_cents,
    account_external_key
  ) values (
    'file-1',
    'sheet-1',
    'row-1',
    'file-1::sheet-1::row-1',
    repeat('a', 64),
    null,
    '{"concept":"Compra original"}'::jsonb,
    date '2026-09-03',
    'Compra original',
    -2599,
    145001,
    'Cuenta principal'
  ) returning id into first_source_id;

  blocked := false;
  begin
    update financial_app.transaction_source_records
    set concept_original = 'No debe poder modificarse'
    where id = first_source_id;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'immutable bank source update was accepted';
  end if;

  insert into financial_app.transaction_source_records (
    source_file_id,
    source_sheet_id,
    source_row_key,
    source_row_identity,
    source_fingerprint,
    supersedes_source_record_id,
    source_payload,
    bank_date,
    concept_original,
    amount_cents,
    balance_after_cents,
    account_external_key
  ) values (
    'file-1',
    'sheet-1',
    'row-1',
    'file-1::sheet-1::row-1',
    repeat('b', 64),
    first_source_id,
    '{"concept":"Compra corregida"}'::jsonb,
    date '2026-09-03',
    'Compra corregida',
    -2600,
    145000,
    'Cuenta principal'
  ) returning id into second_source_id;

  if second_source_id = first_source_id then
    raise exception 'source correction did not create a new immutable snapshot';
  end if;

  blocked := false;
  begin
    insert into financial_app.transaction_source_records (
      source_file_id,
      source_sheet_id,
      source_row_key,
      source_row_identity,
      source_fingerprint,
      supersedes_source_record_id,
      source_payload,
      bank_date,
      concept_original,
      amount_cents,
      balance_after_cents,
      account_external_key
    ) values (
      'file-1',
      'sheet-1',
      'row-1',
      'file-1::sheet-1::row-1',
      repeat('b', 64),
      first_source_id,
      '{"concept":"Duplicado"}'::jsonb,
      date '2026-09-03',
      'Duplicado',
      -2600,
      145000,
      'Cuenta principal'
    );
  exception when unique_violation then
    blocked := true;
  end;

  if not blocked then
    raise exception 'identical source observation was duplicated';
  end if;

  insert into financial_app.transactions (
    source_record_id,
    account_id,
    bank_date,
    concept_normalized,
    merchant_id,
    category_id,
    kind,
    amount_cents,
    balance_after_cents,
    review_state,
    duplicate_state
  ) values (
    second_source_id,
    account_id,
    date '2026-09-03',
    'Compra corregida',
    null,
    child_category_id,
    'expense',
    -2600,
    145000,
    'pending',
    'none'
  ) returning id into transaction_id;

  insert into financial_app.transaction_overrides (
    transaction_id,
    concept_override,
    merchant_id_override,
    merchant_override_set,
    category_id_override,
    category_override_set,
    excluded_from_analytics,
    review_state_override,
    note
  ) values (
    transaction_id,
    null,
    null,
    true,
    null,
    true,
    false,
    'confirmed',
    'Usuario vacía comercio y categoría de forma explícita'
  );

  if not exists (
    select 1
    from financial_app.transaction_overrides
    where transaction_id = transaction_id
      and merchant_override_set = true
      and merchant_id_override is null
      and category_override_set = true
      and category_id_override is null
  ) then
    raise exception 'explicit clear override was not persisted';
  end if;

  blocked := false;
  begin
    delete from financial_app.transaction_source_records
    where id = first_source_id;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'immutable bank source delete was accepted';
  end if;
end;
$$;

rollback;
