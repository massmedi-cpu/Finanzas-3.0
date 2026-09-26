create index if not exists transaction_duplicate_reviews_workspace_reviewed_source_record_id_idx
  on financial_app.transaction_duplicate_reviews (workspace_id, reviewed_source_record_id);

create index if not exists transaction_duplicate_reviews_workspace_transaction_id_idx
  on financial_app.transaction_duplicate_reviews (workspace_id, transaction_id);

create index if not exists transaction_overrides_workspace_category_id_override_idx
  on financial_app.transaction_overrides (workspace_id, category_id_override);

create index if not exists transaction_overrides_workspace_merchant_id_override_idx
  on financial_app.transaction_overrides (workspace_id, merchant_id_override);

create index if not exists transaction_overrides_workspace_transaction_id_idx
  on financial_app.transaction_overrides (workspace_id, transaction_id);

create index if not exists transaction_source_records_workspace_supersedes_source_record_id_idx
  on financial_app.transaction_source_records (workspace_id, supersedes_source_record_id);
