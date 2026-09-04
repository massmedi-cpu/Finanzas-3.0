create index budgets_category_id_idx on financial_app.budgets (category_id);
create index categories_parent_category_id_idx on financial_app.categories (parent_category_id);

create index categorization_rules_account_id_idx on financial_app.categorization_rules (account_id);
create index categorization_rules_merchant_id_idx on financial_app.categorization_rules (merchant_id);
create index categorization_rules_target_category_id_idx on financial_app.categorization_rules (target_category_id);
create index categorization_rules_target_merchant_id_idx on financial_app.categorization_rules (target_merchant_id);

create index document_associations_transaction_id_idx on financial_app.document_transaction_associations (transaction_id);

create index forecast_items_account_id_idx on financial_app.forecast_items (account_id);
create index forecast_items_budget_id_idx on financial_app.forecast_items (budget_id);
create index forecast_items_category_id_idx on financial_app.forecast_items (category_id);
create index forecast_items_confirmed_transaction_id_idx on financial_app.forecast_items (confirmed_transaction_id);
create index forecast_items_merchant_id_idx on financial_app.forecast_items (merchant_id);
create index forecast_items_recurrence_id_idx on financial_app.forecast_items (recurrence_id);

create index merchants_default_category_id_idx on financial_app.merchants (default_category_id);

create index recurrences_account_id_idx on financial_app.recurrences (account_id);
create index recurrences_category_id_idx on financial_app.recurrences (category_id);
create index recurrences_merchant_id_idx on financial_app.recurrences (merchant_id);

create index sync_cursors_last_successful_run_id_idx on financial_app.sync_cursors (last_successful_run_id);

create index transaction_overrides_category_id_override_idx on financial_app.transaction_overrides (category_id_override);
create index transaction_overrides_merchant_id_override_idx on financial_app.transaction_overrides (merchant_id_override);

create index transaction_source_records_supersedes_idx on financial_app.transaction_source_records (supersedes_source_record_id);

create index transactions_merchant_id_idx on financial_app.transactions (merchant_id);
create index transactions_transfer_pair_id_idx on financial_app.transactions (transfer_pair_id);
