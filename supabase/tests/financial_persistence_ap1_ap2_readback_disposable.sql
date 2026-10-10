-- AP1/AP2 separate psql connection: COMMITTED synthetic data survived the writer.
-- Only run after financial_persistence_ap1_ap2_seed_disposable.sql in CI.
-- READ ONLY and always ROLLBACK; the disposable DB is dropped by the shell.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL ROLE financial_app_gateway;

SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

DO $read_a$
DECLARE
  v_accounts integer; v_categories integer; v_budgets integer; v_audits integer;
  v_total bigint; v_category bigint; v_snapshot jsonb;
BEGIN
  SELECT count(*) INTO v_accounts FROM financial_app.accounts;
  SELECT count(*) INTO v_categories FROM financial_app.categories WHERE name='AP1AP2 expense';
  SELECT count(*) INTO v_budgets FROM financial_app.budgets WHERE month='2026-09';
  SELECT count(*) INTO v_audits FROM financial_app.audit_changes
    WHERE entity_type='budget' AND field_name='manual_amount_cents';
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
    WHERE month='2026-09' AND category_id='aa110000-0000-4000-8000-000000000033'::uuid;
  v_snapshot := financial_app.budget_month_snapshot('2026-09');
  IF v_accounts<>1 OR v_categories<>1 OR v_budgets<>2 OR v_audits<>2
     OR v_total IS DISTINCT FROM 123456 OR v_category IS DISTINCT FROM 34567
     OR (v_snapshot->'total'->>'manualAmountCents')::bigint IS DISTINCT FROM 123456
  THEN
    RAISE EXCEPTION 'AP2_SEPARATE_SESSION_TENANT_A_INVALID accounts=% categories=% budgets=% audit=% amount=%',
      v_accounts,v_categories,v_budgets,v_audits,v_total;
  END IF;
  IF (SELECT count(*) FROM financial_app.transaction_source_records) <> 0 THEN
    RAISE EXCEPTION 'AP1_SYNTHETIC_SOURCE_SHOULD_REMAIN_EMPTY_A';
  END IF;
  RAISE NOTICE 'AP1AP2_DISPOSABLE|tenant=A|new_session_budget_read=true|audit_entries=2|source_untouched=true';
END $read_a$;

-- Test that the *same session* discards A completely after changing scope.
SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);

DO $read_b$
DECLARE
  v_accounts integer; v_categories integer; v_budgets integer; v_audits integer;
  v_total bigint; v_category bigint; v_snapshot jsonb;
BEGIN
  SELECT count(*) INTO v_accounts FROM financial_app.accounts;
  SELECT count(*) INTO v_categories FROM financial_app.categories WHERE name='AP1AP2 expense';
  SELECT count(*) INTO v_budgets FROM financial_app.budgets WHERE month='2026-09';
  SELECT count(*) INTO v_audits FROM financial_app.audit_changes
    WHERE entity_type='budget' AND field_name='manual_amount_cents';
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
    WHERE month='2026-09' AND category_id='bb220000-0000-4000-8000-000000000044'::uuid;
  v_snapshot := financial_app.budget_month_snapshot('2026-09');
  IF v_accounts<>1 OR v_categories<>1 OR v_budgets<>2 OR v_audits<>2
     OR v_total IS DISTINCT FROM 654321 OR v_category IS DISTINCT FROM 45678
     OR (v_snapshot->'total'->>'manualAmountCents')::bigint IS DISTINCT FROM 654321
  THEN
    RAISE EXCEPTION 'AP2_SEPARATE_SESSION_TENANT_B_INVALID accounts=% categories=% budgets=% audit=% amount=%',
      v_accounts,v_categories,v_budgets,v_audits,v_total;
  END IF;
  IF (SELECT count(*) FROM financial_app.transaction_source_records) <> 0 THEN
    RAISE EXCEPTION 'AP1_SYNTHETIC_SOURCE_SHOULD_REMAIN_EMPTY_B';
  END IF;
  RAISE NOTICE 'AP1AP2_DISPOSABLE|tenant=B|new_session_budget_read=true|audit_entries=2|source_untouched=true';
END $read_b$;

SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
DO $cross_update_unchanged$
BEGIN
  IF (SELECT manual_amount_cents FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL) IS DISTINCT FROM 123456 THEN
    RAISE EXCEPTION 'AP1_TENANT_A_BUDGET_CHANGED_DURING_TENANT_B_OPERATION';
  END IF;
  IF (SELECT count(*) FROM financial_app.accounts) <> 1 THEN
    RAISE EXCEPTION 'AP1_WORKSPACE_SCOPE_CONTAMINATION_AFTER_SWITCH';
  END IF;
END $cross_update_unchanged$;

ROLLBACK;
\echo 'AP1AP2_DISPOSABLE|readback_success=true|separate_connection=true|cross_tenant_isolation=true'
