create index if not exists forecast_items_workspace_account_id_idx
  on financial_app.forecast_items (workspace_id, account_id);

create index if not exists forecast_items_workspace_budget_id_idx
  on financial_app.forecast_items (workspace_id, budget_id);

create index if not exists forecast_items_workspace_category_id_idx
  on financial_app.forecast_items (workspace_id, category_id);

create index if not exists forecast_items_workspace_confirmed_transaction_id_idx
  on financial_app.forecast_items (workspace_id, confirmed_transaction_id);

create index if not exists forecast_items_workspace_merchant_id_idx
  on financial_app.forecast_items (workspace_id, merchant_id);

create index if not exists forecast_items_workspace_recurrence_id_idx
  on financial_app.forecast_items (workspace_id, recurrence_id);
