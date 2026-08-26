begin;

-- Financial App 3.8.1 — covering index for bulk-edit history foreign key.
-- The primary key starts with batch_id, so it does not cover lookups by transaction_id.
create index if not exists transaction_bulk_batch_items_transaction_id_idx
  on financial_app.transaction_bulk_batch_items(transaction_id);

commit;
