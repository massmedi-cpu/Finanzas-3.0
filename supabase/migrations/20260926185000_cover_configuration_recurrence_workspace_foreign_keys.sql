create index if not exists budgets_workspace_category_id_idx
  on financial_app.budgets (workspace_id, category_id);

create index if not exists categories_workspace_parent_category_id_idx
  on financial_app.categories (workspace_id, parent_category_id);

create index if not exists merchant_aliases_workspace_merchant_id_idx
  on financial_app.merchant_aliases (workspace_id, merchant_id);

create index if not exists merchants_workspace_default_category_id_idx
  on financial_app.merchants (workspace_id, default_category_id);

create index if not exists recurrences_workspace_account_id_idx
  on financial_app.recurrences (workspace_id, account_id);

create index if not exists recurrences_workspace_category_id_idx
  on financial_app.recurrences (workspace_id, category_id);

create index if not exists recurrences_workspace_merchant_id_idx
  on financial_app.recurrences (workspace_id, merchant_id);
