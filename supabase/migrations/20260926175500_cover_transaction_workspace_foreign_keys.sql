create index if not exists transactions_workspace_account_id_idx
  on financial_app.transactions (workspace_id, account_id);

create index if not exists transactions_workspace_category_id_idx
  on financial_app.transactions (workspace_id, category_id);

create index if not exists transactions_workspace_merchant_id_idx
  on financial_app.transactions (workspace_id, merchant_id);

create index if not exists transactions_workspace_source_record_id_idx
  on financial_app.transactions (workspace_id, source_record_id);

create index if not exists transactions_workspace_transfer_pair_id_idx
  on financial_app.transactions (workspace_id, transfer_pair_id);
