-- REC-AP8-308: operator preflight on the existing live DB, strictly READ ONLY.
-- This never proves bank Google Sheets completeness or Edge gateway readiness.
-- Execute via a secure, authorized database connection; never save personal rows.
BEGIN READ ONLY;
WITH document_columns AS (
  SELECT count(*)::int AS existing FROM information_schema.columns
  WHERE table_schema='financial_app' AND table_name='documents'
    AND column_name=ANY(ARRAY['storage_provider','storage_key','original_file_name','mime_type','size_bytes','source_drive_file_id'])
), relations AS (
  SELECT count(*)::int AS tables,
    count(*) FILTER (WHERE c.relrowsecurity)::int AS protected_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='financial_app' AND c.relkind='r'
), checks AS (
 SELECT
   (SELECT existing FROM document_columns) AS document_columns,
   (SELECT tables FROM relations) AS table_count,
   (SELECT protected_tables FROM relations) AS tables_with_rls,
   (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='financial_app' AND c.relname='documents'
      AND t.tgname='documents_private_original_rewrite_guard'
      AND t.tgenabled='O' AND NOT t.tgisinternal) AS original_guards,
   (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='financial_app' AND p.proname='prevent_private_original_rewrite'
      AND NOT p.prosecdef) AS invoker_guard_functions,
   (SELECT count(*)::int FROM financial_app.transaction_source_records) AS source_records,
   (SELECT count(*)::int FROM financial_app.transactions) AS transactions,
   (SELECT count(*)::int FROM financial_app.transactions t
      LEFT JOIN financial_app.transaction_source_records s ON s.id=t.source_record_id
      WHERE s.id IS NULL) AS transactions_without_source,
   (SELECT count(*)::int FROM financial_app.transaction_source_records s
      LEFT JOIN financial_app.transactions t ON t.source_record_id=s.id
      WHERE t.id IS NULL) AS sources_without_transaction
), output AS (
 SELECT checks.*,
 ARRAY_REMOVE(ARRAY[
  CASE WHEN document_columns<>6 THEN 'document_columns_missing'::text END,
  CASE WHEN table_count<>tables_with_rls OR table_count<1 THEN 'financial_rls_incomplete'::text END,
  CASE WHEN original_guards<>1 OR invoker_guard_functions<>1 THEN 'original_immutability_missing'::text END,
  CASE WHEN source_records<>transactions OR transactions_without_source<>0 OR sources_without_transaction<>0
    THEN 'existing_transaction_links_inconsistent'::text END,
  CASE WHEN to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NOT NULL
      AND (COALESCE(has_function_privilege('anon','financial_app.prevent_private_original_rewrite()','EXECUTE'),false)
        OR COALESCE(has_function_privilege('authenticated','financial_app.prevent_private_original_rewrite()','EXECUTE'),false))
    THEN 'original_guard_executable_by_client'::text END
 ],NULL::text) AS blockers
 FROM checks
)
SELECT CASE WHEN cardinality(blockers)=0 THEN 'ready' ELSE 'blocked' END AS ap8_db_readiness,
 blockers, document_columns, table_count, tables_with_rls, original_guards,
 invoker_guard_functions, source_records, transactions,
 transactions_without_source, sources_without_transaction
FROM output;
COMMIT;
