create index if not exists document_transaction_associations_workspace_document_id_idx
  on financial_app.document_transaction_associations (workspace_id, document_id);

create index if not exists document_transaction_associations_workspace_transaction_id_idx
  on financial_app.document_transaction_associations (workspace_id, transaction_id);

create index if not exists workspace_deletion_intents_requested_by_user_id_idx
  on financial_app.workspace_deletion_intents (requested_by_user_id);
