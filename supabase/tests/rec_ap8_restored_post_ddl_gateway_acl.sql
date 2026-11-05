-- REC-AP8-591: Reconstruct ONLY the verified effective gateway table ACLs
-- in authentic production-backup PostgreSQL 17 RESTORED ON LOCALHOST.
-- Sourced verbatim from rec_ap8_restored_backup_upgrade_rollback.sql.
-- Never run this file on live Supabase or a cloud database.
\set ON_ERROR_STOP on
DO $local_only$
BEGIN
  IF current_database()<>'financial_app_production_backup_restore_check'
    OR current_user<>'postgres'
    -- The parent CI runner enforces the exact localhost connection URL.
    -- Docker's mapped 127.0.0.1 port is served by a bridge IP inside PG17.
    OR (SELECT count(*) FROM financial_app.transaction_source_records)<>3188
    OR (SELECT count(*) FROM financial_app.transactions)<>3188
  THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_ACL_LOCAL_RESTORE_ONLY'; END IF;
END $local_only$;
BEGIN;
GRANT USAGE ON SCHEMA financial_app TO financial_app_gateway;
REVOKE ALL ON ALL TABLES IN SCHEMA financial_app FROM financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.account_source_mappings TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.accounts TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.audit_changes TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.budgets TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.categories TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.categorization_rules TO financial_app_gateway;
GRANT SELECT, INSERT ON financial_app.document_ocr_reviews TO financial_app_gateway;
GRANT SELECT, INSERT ON financial_app.document_ocr_runs TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.document_transaction_associations TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.documents TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.forecast_items TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.google_oauth_connections TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.google_source_policy TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.merchant_aliases TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.merchants TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.recurrences TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.sync_cursors TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.sync_issues TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.sync_runs TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.transaction_duplicate_reviews TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.transaction_overrides TO financial_app_gateway;
GRANT SELECT, INSERT ON financial_app.transaction_source_records TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.transaction_split_allocations TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.transaction_tags TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.transactions TO financial_app_gateway;
GRANT SELECT, INSERT, UPDATE ON financial_app.workspace_deletion_intents TO financial_app_gateway;
GRANT SELECT ON financial_app.workspace_deletion_runtime_policy TO financial_app_gateway;
DO $acl_check$
DECLARE r record; permission text; expected boolean; actual boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES
  ('account_source_mappings', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('accounts', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('audit_changes', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('authorized_users', ARRAY[]::text[]),
  ('budgets', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('categories', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('categorization_rules', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('document_ocr_reviews', ARRAY['SELECT','INSERT']::text[]),
  ('document_ocr_runs', ARRAY['SELECT','INSERT']::text[]),
  ('document_transaction_associations', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('documents', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('forecast_items', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('google_oauth_connections', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('google_source_policy', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('merchant_aliases', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('merchants', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('recurrences', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('schema_meta', ARRAY[]::text[]),
  ('sync_cursors', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('sync_issues', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('sync_runs', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('transaction_duplicate_reviews', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('transaction_overrides', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('transaction_source_records', ARRAY['SELECT','INSERT']::text[]),
  ('transaction_split_allocations', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('transaction_tags', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('transactions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
  ('workspace_deletion_intents', ARRAY['SELECT','INSERT','UPDATE']::text[]),
  ('workspace_deletion_receipts', ARRAY[]::text[]),
  ('workspace_deletion_runtime_policy', ARRAY['SELECT']::text[]),
  ('workspace_memberships', ARRAY[]::text[]),
  ('workspaces', ARRAY[]::text[])
  ) AS acl(table_name, privileges) LOOP
    FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      expected := permission=ANY(r.privileges);
      actual := has_table_privilege('financial_app_gateway',format('financial_app.%I',r.table_name),permission);
      IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'REC_AP8_RESTORED_GATEWAY_ACL_MISMATCH';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='financial_app' AND c.relkind='r')<>32
    OR NOT has_schema_privilege('financial_app_gateway','financial_app','USAGE') THEN
    RAISE EXCEPTION 'REC_AP8_RESTORED_GATEWAY_TABLES_MISMATCH';
  END IF;
END $acl_check$;

COMMIT;
