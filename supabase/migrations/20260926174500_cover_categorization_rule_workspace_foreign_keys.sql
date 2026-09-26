create index if not exists categorization_rules_workspace_account_id_idx
  on financial_app.categorization_rules (workspace_id, account_id);

create index if not exists categorization_rules_workspace_category_id_idx
  on financial_app.categorization_rules (workspace_id, category_id);

create index if not exists categorization_rules_workspace_merchant_id_idx
  on financial_app.categorization_rules (workspace_id, merchant_id);

create index if not exists categorization_rules_workspace_target_category_id_idx
  on financial_app.categorization_rules (workspace_id, target_category_id);

create index if not exists categorization_rules_workspace_target_merchant_id_idx
  on financial_app.categorization_rules (workspace_id, target_merchant_id);
