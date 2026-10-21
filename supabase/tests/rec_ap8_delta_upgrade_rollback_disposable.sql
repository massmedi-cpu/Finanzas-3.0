-- REC-AP8-246 · PostgreSQL 17 disposable-only rehearsal.
-- The starting schema is SYNTHETIC 10.0.103-compatible, NOT a production backup.
-- Migration application, metadata assertions and rollback never reach Supabase.
\set ON_ERROR_STOP on
SET statement_timeout = '90s';

DO $preflight$
BEGIN
  IF current_database() <> 'financial_app_pre001_disposable'
    OR to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname='documents_private_original_rewrite_guard' AND NOT tgisinternal
    ) THEN
    RAISE EXCEPTION 'REC_AP8_DISPOSABLE_BASELINE_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_app.transactions)
    OR NOT EXISTS (SELECT 1 FROM financial_app.transaction_source_records)
    OR to_regclass('financial_app.documents') IS NULL THEN
    RAISE EXCEPTION 'REC_AP8_SYNTHETIC_BASELINE_DATA_OR_DOCUMENT_TABLE_MISSING';
  END IF;
END $preflight$;

CREATE TEMP TABLE rec_ap8_functions AS
SELECT p.oid::regprocedure::text AS signature,
       pg_get_functiondef(p.oid) AS definition,
       p.proowner, p.proacl, p.prosecdef, p.provolatile
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='financial_app'
  AND p.proname IN ('financial_transaction_facts','query_effective_transactions_v4')
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
  IF (SELECT count(*) FROM rec_ap8_functions)<>2
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
    RAISE EXCEPTION 'REC_AP8_NOT_FULL_FINANCIAL_SCHEMA';
  END IF;
END $capture$;

\echo REC_AP8_DELTA|phase=upgrade|schema=synthetic_10_0_103_compatible
\i supabase/migrations/20261011205000_ap1_private_document_original_immutable.sql
\i supabase/migrations/20261017154629_optimize_transaction_category_labels.sql
\i supabase/migrations/20261017160009_batch_transaction_split_facts.sql
\i supabase/migrations/20261017160345_statement_workspace_policy_context.sql

DO $postflight$
DECLARE r record; v_digest text; v_bad integer := 0;
BEGIN
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
  RAISE NOTICE 'REC_AP8_DELTA|upgrade=passed|routines=2|policies=2|rls_preserved=true|original_guard=true|data_unchanged=true';
END $postflight$;

-- These existing real PostgreSQL fixtures run with the restricted gateway role.
-- Each wraps its synthetic fixture in BEGIN/ROLLBACK (no banking data).
\i supabase/tests/ap1_private_document_original_immutable.sql
\i supabase/tests/transaction_category_label_batch_disposable.sql
\i supabase/tests/transaction_split_fact_batch_disposable.sql

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
    FULL JOIN pg_proc p ON p.oid=b.signature::regprocedure
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
SELECT 'REC_AP8_DELTA|status=ok|baseline=synthetic_10_0_103_compatible|upgrade_migrations=4|rollback=true|live_data_access=false' AS result;
