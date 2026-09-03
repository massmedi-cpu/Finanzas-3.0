begin;

do $$
declare
  v_account_id uuid;
  v_source_category_id uuid;
  v_target_category_id uuid;
  v_child_category_id uuid;
  v_source_record_id uuid;
  v_transaction_id uuid;
  v_merchant_id uuid;
  v_recurrence_id uuid;
  v_budget_id uuid;
  v_forecast_id uuid;
  v_rule_id uuid;
begin
  insert into financial_app.accounts (
    name, institution, type, opening_balance_cents, currency, lifecycle, sort_order
  ) values (
    'Cuenta configuración', 'Banco test', 'checking', 123456, 'EUR', 'active', 0
  ) returning id into v_account_id;

  update financial_app.accounts
  set name = 'Cuenta configuración editada', lifecycle = 'archived', sort_order = 2
  where id = v_account_id;

  if not exists (
    select 1 from financial_app.accounts
    where id = v_account_id
      and name = 'Cuenta configuración editada'
      and lifecycle = 'archived'
      and sort_order = 2
      and currency = 'EUR'
  ) then
    raise exception 'account create/update/archive persistence failed';
  end if;

  insert into financial_app.categories (
    name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
  ) values ('Origen', 'expense', null, 'source', 'category.source', 'active', 0)
  returning id into v_source_category_id;

  insert into financial_app.categories (
    name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
  ) values ('Destino', 'expense', null, 'target', 'category.target', 'active', 1)
  returning id into v_target_category_id;

  insert into financial_app.categories (
    name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
  ) values ('Hija', 'expense', v_source_category_id, 'child', 'category.child', 'active', 0)
  returning id into v_child_category_id;

  insert into financial_app.merchants (normalized_name, default_category_id)
  values ('comercio merge', v_source_category_id)
  returning id into v_merchant_id;

  insert into financial_app.transaction_source_records (
    source_file_id, source_sheet_id, source_row_key, source_fingerprint,
    source_payload, bank_date, concept_original, amount_cents,
    balance_after_cents, account_external_key, source_row_identity
  ) values (
    'config-test', 'movements', 'row-1', repeat('c', 64),
    '{"test":true}'::jsonb, date '2026-09-03', 'Movimiento merge', -1000,
    120000, 'Cuenta configuración', 'config-test::movements::row-1'
  ) returning id into v_source_record_id;

  insert into financial_app.transactions (
    source_record_id, account_id, bank_date, concept_normalized,
    merchant_id, category_id, kind, amount_cents, balance_after_cents
  ) values (
    v_source_record_id, v_account_id, date '2026-09-03', 'Movimiento merge',
    v_merchant_id, v_source_category_id, 'expense', -1000, 120000
  ) returning id into v_transaction_id;

  insert into financial_app.transaction_overrides (
    transaction_id, category_id_override, category_override_set
  ) values (v_transaction_id, v_source_category_id, true);

  insert into financial_app.categorization_rules (
    name, target_category_id
  ) values ('Regla merge', v_source_category_id)
  returning id into v_rule_id;

  insert into financial_app.recurrences (
    category_id, account_id, concept_pattern, interval_unit, interval_count,
    usual_amount_cents
  ) values (
    v_source_category_id, v_account_id, 'Recurrente merge', 'month', 1, -1000
  ) returning id into v_recurrence_id;

  insert into financial_app.budgets (
    month, category_id, automatic_amount_cents, explanation
  ) values ('2026-09', v_source_category_id, 10000, 'Test merge')
  returning id into v_budget_id;

  insert into financial_app.forecast_items (
    date, account_id, category_id, merchant_id, concept, amount_cents,
    origin, confidence, recurrence_id, budget_id
  ) values (
    date '2026-09-15', v_account_id, v_source_category_id, v_merchant_id,
    'Previsión merge', -1000, 'manual', 'high', v_recurrence_id, v_budget_id
  ) returning id into v_forecast_id;

  update financial_app.categories
  set parent_category_id = v_target_category_id, updated_at = now()
  where parent_category_id = v_source_category_id;

  update financial_app.merchants
  set default_category_id = v_target_category_id, updated_at = now()
  where default_category_id = v_source_category_id;

  update financial_app.transactions
  set category_id = v_target_category_id, updated_at = now()
  where category_id = v_source_category_id;

  update financial_app.transaction_overrides
  set category_id_override = v_target_category_id, updated_at = now()
  where category_override_set = true and category_id_override = v_source_category_id;

  update financial_app.categorization_rules
  set target_category_id = v_target_category_id, updated_at = now()
  where target_category_id = v_source_category_id;

  update financial_app.recurrences
  set category_id = v_target_category_id, updated_at = now()
  where category_id = v_source_category_id;

  update financial_app.budgets
  set category_id = v_target_category_id, updated_at = now()
  where category_id = v_source_category_id;

  update financial_app.forecast_items
  set category_id = v_target_category_id, updated_at = now()
  where category_id = v_source_category_id;

  update financial_app.categories
  set lifecycle = 'archived', parent_category_id = null, updated_at = now()
  where id = v_source_category_id;

  if not exists (
    select 1 from financial_app.categories
    where id = v_source_category_id and lifecycle = 'archived'
  ) or not exists (
    select 1 from financial_app.categories
    where id = v_child_category_id and parent_category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.merchants
    where id = v_merchant_id and default_category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.transactions
    where id = v_transaction_id and category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.transaction_overrides
    where transaction_id = v_transaction_id
      and category_override_set = true
      and category_id_override = v_target_category_id
  ) or not exists (
    select 1 from financial_app.categorization_rules
    where id = v_rule_id and target_category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.recurrences
    where id = v_recurrence_id and category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.budgets
    where id = v_budget_id and category_id = v_target_category_id
  ) or not exists (
    select 1 from financial_app.forecast_items
    where id = v_forecast_id and category_id = v_target_category_id
  ) then
    raise exception 'category merge persistence failed';
  end if;
end;
$$;

rollback;
