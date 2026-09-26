create index if not exists account_source_mappings_workspace_account_id_idx
  on financial_app.account_source_mappings (workspace_id, account_id);

create index if not exists sync_cursors_workspace_last_successful_run_id_idx
  on financial_app.sync_cursors (workspace_id, last_successful_run_id);

create index if not exists sync_issues_workspace_sync_run_id_idx
  on financial_app.sync_issues (workspace_id, sync_run_id);
