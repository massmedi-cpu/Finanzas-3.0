-- REC-REL-463 · PostgreSQL 17 authentic encrypted backup-v2 rehearsal, PR 619.
-- The baseline comes from the verified 2026-10-20 production 10.0.103 backup,
-- restored on loopback in isolated GitHub Actions Postgres; NEVER query or write live Supabase.
-- Never log originals, extracted banking rows, bearer credentials or backup contents.
\set ON_ERROR_STOP on
SET statement_timeout = '90s';

DO $preflight$
BEGIN
  IF current_database() <> 'financial_app_production_backup_restore_check'
    OR to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname='documents_private_original_rewrite_guard' AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'REC_AP8_AUTHENTIC_RESTORE_BASELINE_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_app.transactions)
    OR NOT EXISTS (SELECT 1 FROM financial_app.transaction_source_records)
    OR to_regclass('financial_app.documents') IS NULL THEN
    RAISE EXCEPTION 'REC_AP8_AUTHENTIC_BASELINE_DATA_OR_DOCUMENT_TABLE_MISSING';
  END IF;
END $preflight$;

-- REC-AP8-312: ACL replica captured via READ ONLY catalog query from live
-- Supabase on 2026-10-22. The portable backup uses --no-privileges.
-- Rebuild only the *effective* gateway table permissions on the 127.0.0.1
-- restored database. Zero customer rows or credentials in this static ACL.
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

-- REC-REL-463: a pg_dump restored with --no-privileges drops function ACLs.
-- Mirror the LIVE 10.0.103 function grant (confirmed read-only on 2026-10-25)
-- INSIDE THE THROWAWAY DATABASE only, before capturing the baseline.
-- This is NOT permission widening: gateway may EXECUTE; anon/authenticated
-- and service_role cannot. The function remains SECURITY INVOKER.
DO $archived_function_acl$
DECLARE
  target oid := 'financial_app.financial_balance_series(date,date,uuid)'::regprocedure;
  actual text;
BEGIN
  IF current_database() <> 'financial_app_production_backup_restore_check'
     OR current_user <> 'postgres'
     OR (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid=target) <> 'postgres'
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=target) IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'REC_AP8_ARCHIVED_FUNCTION_ACL_WRONG_CONTEXT';
  END IF;
  EXECUTE 'REVOKE ALL ON FUNCTION financial_app.financial_balance_series(date,date,uuid) FROM PUBLIC, anon, authenticated, service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION financial_app.financial_balance_series(date,date,uuid) TO financial_app_gateway';
  SELECT p.proacl::text INTO actual FROM pg_proc p WHERE p.oid=target;
  IF actual <> '{postgres=X/postgres,financial_app_gateway=X/postgres}'
    OR NOT has_function_privilege('financial_app_gateway',target,'EXECUTE')
    OR has_function_privilege('anon',target,'EXECUTE')
    OR has_function_privilege('authenticated',target,'EXECUTE')
    OR has_function_privilege('service_role',target,'EXECUTE')
  THEN
    RAISE EXCEPTION 'REC_AP8_ARCHIVED_FUNCTION_ACL_DOES_NOT_MATCH_LIVE';
  END IF;
END $archived_function_acl$;

CREATE TEMP TABLE rec_ap8_functions AS
SELECT p.oid::regprocedure::text AS signature,
       pg_get_functiondef(p.oid) AS definition,
       p.proowner, p.proacl, p.prosecdef, p.provolatile
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='financial_app'
  AND p.proname IN ('financial_transaction_facts','query_effective_transactions_v4','financial_balance_series')
  AND (p.proname='query_effective_transactions_v4'
       OR pg_get_function_identity_arguments(p.oid)='p_date_from date, p_date_to date, p_account_id uuid');

CREATE TEMP TABLE rec_ap8_policies AS
SELECT c.relname, p.polname,
       pg_get_expr(p.polqual,p.polrelid) AS predicate,
       pg_get_expr(p.polwithcheck,p.polrelid) AS write_check,
       p.polroles, p.polcmd, c.relrowsecurity, c.relforcerowsecurity
FROM pg_policy p
JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='financial_app'
  AND ((c.relname='transactions' AND p.polname='transactions_workspace_isolation')
    OR (c.relname='transaction_source_records'
        AND p.polname='transaction_source_records_workspace_isolation'));

CREATE TEMP TABLE rec_ap8_rows(table_name text PRIMARY KEY, digest text NOT NULL);
DO $capture$
DECLARE r record; v_digest text;
BEGIN
  IF (SELECT count(*) FROM rec_ap8_functions)<>3
    OR (SELECT count(*) FROM rec_ap8_policies)<>2 THEN
    RAISE EXCEPTION 'REC_AP8_BASELINE_SIGNATURE_OR_POLICY_MISSING';
  END IF;
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='financial_app' AND c.relkind='r'
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'SELECT coalesce(md5(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text))),md5('''')) FROM financial_app.%I t',
      r.relname
    ) INTO v_digest;
    INSERT INTO rec_ap8_rows VALUES(r.relname,v_digest);
  END LOOP;
  IF (SELECT count(*) FROM rec_ap8_rows)<30 THEN
    RAISE EXCEPTION 'REC_AP8_RESTORED_SCHEMA_INCOMPLETE';
  END IF;
END $capture$;

-- REC-REL-464: prove the archived-account defect exists on the authentic
-- 10.0.103 baseline. No balances, banking identifiers or account names logged.
DO $archived_before$
DECLARE
  a record;
  month_row jsonb;
  series jsonb;
  canonical jsonb;
  month_count integer := 0;
  mismatch_count integer := 0;
BEGIN
  SELECT id, workspace_id INTO a
  FROM financial_app.accounts WHERE lifecycle = 'archived'
  ORDER BY id LIMIT 1;
  IF a.id IS NULL OR a.workspace_id IS NULL THEN
    RAISE EXCEPTION 'REC_AP8_AUTHENTIC_ARCHIVED_ACCOUNT_REQUIRED';
  END IF;
  PERFORM pg_catalog.set_config('financial_app.workspace_id', a.workspace_id::text, true);
  series := financial_app.financial_balance_series(date '2018-11-01', date '2026-10-25', a.id);
  FOR month_row IN SELECT value FROM pg_catalog.jsonb_array_elements(series->'rows') LOOP
    month_count := month_count + 1;
    canonical := financial_app.financial_account_balances((month_row->>'asOfDate')::date, false, a.id);
    IF (month_row->>'balanceCents')::bigint
      IS DISTINCT FROM (canonical->>'totalBalanceCents')::bigint THEN
      mismatch_count := mismatch_count + 1;
    END IF;
  END LOOP;
  IF month_count <> 96 OR mismatch_count = 0 THEN
    RAISE EXCEPTION 'REC_AP8_AUTHENTIC_ARCHIVED_DEFECT_NOT_REPRODUCED';
  END IF;
  RAISE NOTICE 'REC_AP8_ARCHIVED_BALANCE|baseline=defect_reproduced|months=%|mismatched=%|source=restored_backup', month_count, mismatch_count;
END $archived_before$;

\echo REC_AP8_DELTA|phase=upgrade|schema=restored_production_10_0_103
\i supabase/migrations/20261011205000_ap1_private_document_original_immutable.sql
\i supabase/migrations/20261017154629_optimize_transaction_category_labels.sql
\i supabase/migrations/20261017160009_batch_transaction_split_facts.sql
\i supabase/migrations/20261017160345_statement_workspace_policy_context.sql
\i supabase/migrations/20261024145500_rec_rel_430_archived_balance_series_scope.sql

DO $postflight$
DECLARE r record; v_digest text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='financial_app.financial_balance_series(date,date,uuid)'::regprocedure
      AND pg_get_functiondef(p.oid) ILIKE '%when p_account_id is null then%'
  ) THEN
    RAISE EXCEPTION 'REC_AP8_ARCHIVED_ACCOUNT_BALANCE_FIX_MISSING';
  END IF;
  IF to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='financial_app' AND c.relname='documents'
        AND t.tgname='documents_private_original_rewrite_guard'
        AND t.tgenabled='O' AND NOT t.tgisinternal
    ) THEN
    RAISE EXCEPTION 'REC_AP8_IMMUTABLE_ORIGINAL_GUARD_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM rec_ap8_functions b JOIN pg_proc p ON p.oid=b.signature::regprocedure
    WHERE b.proowner IS DISTINCT FROM p.proowner
      OR b.proacl IS DISTINCT FROM p.proacl
      OR b.prosecdef IS DISTINCT FROM p.prosecdef
      OR b.provolatile IS DISTINCT FROM p.provolatile
      OR b.definition = pg_get_functiondef(p.oid)
  ) THEN
    RAISE EXCEPTION 'REC_AP8_UPGRADE_CHANGED_PRIVILEGES_OR_NO_NEW_DEFINITION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM rec_ap8_policies b
    JOIN pg_class c ON c.relname=b.relname
      AND c.relnamespace='financial_app'::regnamespace
    JOIN pg_policy p ON p.polrelid=c.oid AND p.polname=b.polname
    WHERE c.relrowsecurity IS DISTINCT FROM b.relrowsecurity
      OR c.relforcerowsecurity IS DISTINCT FROM b.relforcerowsecurity
      OR p.polroles IS DISTINCT FROM b.polroles
      OR p.polcmd IS DISTINCT FROM b.polcmd
      OR pg_get_expr(p.polqual,p.polrelid) IS NOT DISTINCT FROM b.predicate
      OR pg_get_expr(p.polwithcheck,p.polrelid) IS NOT DISTINCT FROM b.write_check
      OR pg_get_expr(p.polqual,p.polrelid) NOT ILIKE '%require_current_workspace_id%'
      OR pg_get_expr(p.polwithcheck,p.polrelid) NOT ILIKE '%require_current_workspace_id%'
  ) THEN
    RAISE EXCEPTION 'REC_AP8_WORKSPACE_RLS_CHANGED_UNEXPECTEDLY';
  END IF;
  IF has_function_privilege('anon','financial_app.prevent_private_original_rewrite()','EXECUTE')
    OR has_function_privilege('authenticated','financial_app.prevent_private_original_rewrite()','EXECUTE')
    OR has_table_privilege('anon','financial_app.transaction_source_records','UPDATE')
    OR has_table_privilege('authenticated','financial_app.transaction_source_records','DELETE') THEN
    RAISE EXCEPTION 'REC_AP8_CLIENT_PRIVILEGE_ESCALATION';
  END IF;
  FOR r IN SELECT * FROM rec_ap8_rows LOOP
    EXECUTE format(
      'SELECT coalesce(md5(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text))),md5('''')) FROM financial_app.%I t',
      r.table_name
    ) INTO v_digest;
    IF v_digest IS DISTINCT FROM r.digest THEN
      RAISE EXCEPTION 'REC_AP8_MIGRATION_MUTATED_FINANCIAL_DATA table=%',r.table_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'REC_AP8_DELTA|upgrade=passed|routines=3|policies=2|rls_preserved=true|original_guard=true|data_unchanged=true';
END $postflight$;

-- REC-REL-464: on the restored real-data backup, the upgraded routine
-- must equal the independent canonical balance for EVERY one of 96 months.
-- The unfiltered timeline must still exclude archived-account balances.
DO $archived_after$
DECLARE
  a record;
  month_row jsonb;
  series jsonb;
  canonical jsonb;
  month_count integer := 0;
  archived_checked integer := 0;
  general_count integer := 0;
BEGIN
  FOR a IN SELECT id,workspace_id FROM financial_app.accounts WHERE lifecycle='archived' ORDER BY id LOOP
    archived_checked := archived_checked + 1;
    PERFORM pg_catalog.set_config('financial_app.workspace_id', a.workspace_id::text, true);
    series := financial_app.financial_balance_series(date '2018-11-01',date '2026-10-25',a.id);
    IF pg_catalog.jsonb_array_length(series->'rows') <> 96 THEN
      RAISE EXCEPTION 'REC_AP8_ARCHIVED_SERIES_MONTH_COUNT_MISMATCH';
    END IF;
    FOR month_row IN SELECT value FROM pg_catalog.jsonb_array_elements(series->'rows') LOOP
      month_count := month_count + 1;
      canonical := financial_app.financial_account_balances((month_row->>'asOfDate')::date,false,a.id);
      IF (month_row->>'balanceCents')::bigint
         IS DISTINCT FROM (canonical->>'totalBalanceCents')::bigint
         OR month_row->>'monthStart' IS NULL
         OR month_row->>'asOfDate' IS NULL THEN
        RAISE EXCEPTION 'REC_AP8_ARCHIVED_BALANCE_NOT_CANONICAL';
      END IF;
    END LOOP;
    series := financial_app.financial_balance_series(date '2018-11-01',date '2026-10-25',null);
    IF pg_catalog.jsonb_array_length(series->'rows') <> 96 THEN
      RAISE EXCEPTION 'REC_AP8_GENERAL_SERIES_MONTH_COUNT_MISMATCH';
    END IF;
    FOR month_row IN SELECT value FROM pg_catalog.jsonb_array_elements(series->'rows') LOOP
      general_count := general_count + 1;
      canonical := financial_app.financial_account_balances((month_row->>'asOfDate')::date,false,null);
      IF (month_row->>'balanceCents')::bigint
         IS DISTINCT FROM (canonical->>'activeBalanceCents')::bigint THEN
        RAISE EXCEPTION 'REC_AP8_ARCHIVED_BALANCE_LEAKED_TO_GENERAL_SERIES';
      END IF;
    END LOOP;
  END LOOP;
  IF archived_checked=0 OR month_count <> 96 * archived_checked
    OR general_count <> 96 * archived_checked THEN
    RAISE EXCEPTION 'REC_AP8_ARCHIVED_ACCOUNT_MATRIX_INCOMPLETE';
  END IF;
  RAISE NOTICE 'REC_AP8_ARCHIVED_BALANCE|status=ok|archived_accounts=%|scoped_months=%|general_months=%|mismatches=0',archived_checked,month_count,general_count;
END $archived_after$;

-- These existing real PostgreSQL fixtures run with the restricted gateway role.
-- Each wraps its synthetic fixture in BEGIN/ROLLBACK (no banking data).
\i supabase/tests/ap1_private_document_original_immutable.sql
\i supabase/tests/transaction_category_label_batch_restored_103.sql
\i supabase/tests/transaction_split_fact_batch_restored_103.sql
\i supabase/tests/rec_sync_append_only_restored_103.sql

\echo REC_AP8_DELTA|phase=rollback|target=disposable_only
DO $restore$
DECLARE r record;
BEGIN
  -- Restore the executable baseline and policies, then remove the AP1 guard.
  FOR r IN SELECT * FROM rec_ap8_functions ORDER BY signature LOOP
    EXECUTE r.definition;
  END LOOP;
  FOR r IN SELECT * FROM rec_ap8_policies ORDER BY relname LOOP
    EXECUTE format(
      'ALTER POLICY %I ON financial_app.%I USING (%s) WITH CHECK (%s)',
      r.polname, r.relname, r.predicate, r.write_check
    );
  END LOOP;
  DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents;
  DROP FUNCTION financial_app.prevent_private_original_rewrite();
END $restore$;

DO $final$
DECLARE r record; v_digest text;
BEGIN
  IF to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='documents_private_original_rewrite_guard' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'REC_AP8_AP1_GUARD_ROLLBACK_FAILED'; END IF;
  IF EXISTS (
    SELECT 1 FROM rec_ap8_functions b
    LEFT JOIN pg_proc p ON p.oid=b.signature::regprocedure
    WHERE p.oid IS NULL OR b.definition IS DISTINCT FROM pg_get_functiondef(p.oid)
      OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl
      OR b.prosecdef IS DISTINCT FROM p.prosecdef
      OR b.provolatile IS DISTINCT FROM p.provolatile
  ) THEN RAISE EXCEPTION 'REC_AP8_FUNCTION_ROLLBACK_FAILED'; END IF;
  IF EXISTS (
    SELECT 1 FROM rec_ap8_policies b
    JOIN pg_class c ON c.relname=b.relname AND c.relnamespace='financial_app'::regnamespace
    JOIN pg_policy p ON p.polrelid=c.oid AND p.polname=b.polname
    WHERE pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM b.predicate
      OR pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM b.write_check
      OR p.polroles IS DISTINCT FROM b.polroles OR p.polcmd IS DISTINCT FROM b.polcmd
      OR c.relrowsecurity IS DISTINCT FROM b.relrowsecurity
      OR c.relforcerowsecurity IS DISTINCT FROM b.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'REC_AP8_RLS_ROLLBACK_FAILED'; END IF;
  FOR r IN SELECT * FROM rec_ap8_rows LOOP
    EXECUTE format(
      'SELECT coalesce(md5(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text))),md5('''')) FROM financial_app.%I t',
      r.table_name
    ) INTO v_digest;
    IF v_digest IS DISTINCT FROM r.digest THEN
      RAISE EXCEPTION 'REC_AP8_ROLLBACK_MUTATED_FINANCIAL_DATA table=%',r.table_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'REC_AP8_DELTA|rollback=passed|routine_defs_acls_identical=true|rls_identical=true|financial_data_identical=true';
END $final$;
SELECT 'REC_AP8_DELTA|status=ok|baseline=authentic_10_0_103_restored|upgrade_migrations=5|rollback=true|live_production_writes=false' AS result;
