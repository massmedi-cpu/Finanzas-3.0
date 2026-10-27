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
  WHERE n.nspname='financial_app' AND c.relkind IN ('r','p')
), checks AS (
 SELECT
   (SELECT existing FROM document_columns) AS document_columns,
   (SELECT tables FROM relations) AS table_count,
   (SELECT protected_tables FROM relations) AS tables_with_rls,
   (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='financial_app' AND c.relname='documents'
      AND t.tgname='documents_private_original_rewrite_guard'
      AND t.tgenabled='O' AND NOT t.tgisinternal
      -- Reject triggers that only fire for selected columns or under a WHEN
      -- condition: either could silently permit changing the original identity.
      AND t.tgfoid=to_regprocedure('financial_app.prevent_private_original_rewrite()')
      AND t.tgtype=19 -- row + before + update, without other event types
      AND cardinality(t.tgattr::smallint[])=0 AND t.tgqual IS NULL
      AND t.tgnargs=0) AS original_guards,
   (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname='financial_app' AND p.proname='prevent_private_original_rewrite'
      AND p.oid=to_regprocedure('financial_app.prevent_private_original_rewrite()')
      AND NOT p.prosecdef AND l.lanname='plpgsql' AND NOT p.proretset
      -- A text search can match comments in a function that merely RETURNs NEW.
      -- Fail closed unless the stored body is byte-identical to the reviewed
      -- 20261011205000 migration. Update this digest and its test together only
      -- when a different function body has been reviewed and accepted.
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') =
        '07afeb8e053a5878d76079ee574965f12e75cf89325eb4914bbccbd2601dfc0d'
      ) AS invoker_guard_functions,
   -- A different BEFORE UPDATE row trigger may modify NEW *after* the guard
   -- has checked it. Accept only the reviewed timestamp helper; block other
   -- active triggers until they have been examined and explicitly allowed.
   (SELECT count(*)::int FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='financial_app' AND c.relname='documents'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND (t.tgtype & 19)=19
      AND t.tgname<>'documents_private_original_rewrite_guard'
      AND NOT (
        t.tgname='documents_touch_updated_at'
        AND t.tgfoid=to_regprocedure('financial_app.touch_updated_at()')
        AND EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
          WHERE p.oid=t.tgfoid AND l.lanname='plpgsql' AND NOT p.prosecdef
          AND p.proconfig=ARRAY['search_path=pg_catalog, financial_app']::text[]
          AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') =
            'ce58f72c076133a6714fe25fb2811de2b4cdc36cb7b1e7bbcab220f62b2b1d7e'
        )
      )) AS unverified_document_update_triggers,
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
  CASE WHEN unverified_document_update_triggers<>0 THEN 'document_update_trigger_unverified'::text END,
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
 invoker_guard_functions, unverified_document_update_triggers, source_records, transactions,
 transactions_without_source, sources_without_transaction
FROM output;
COMMIT;
