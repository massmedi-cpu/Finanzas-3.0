-- AP2 update/clear: committed business mutations on synthetic data ONLY.
-- This is an independent third psql connection on the dedicated ephemeral DB.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'financial_app_pre001_disposable' THEN
    RAISE EXCEPTION 'AP1AP2_FIXTURE_MUST_USE_DISPOSABLE_LOCAL_DB';
  END IF;
END $guard$;

BEGIN;
SET LOCAL ROLE financial_app_gateway;
SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

-- Edit total limit, clear category override; retain the historical reference.
SELECT financial_app.set_budget_manual_amount('2026-09',NULL,222222);
SELECT financial_app.set_budget_manual_amount(
  '2026-09','aa110000-0000-4000-8000-000000000033'::uuid,NULL
);

DO $mutations$
DECLARE v_total bigint; v_category bigint; v_audits integer;
BEGIN
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
  WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
  WHERE month='2026-09' AND category_id='aa110000-0000-4000-8000-000000000033'::uuid;
  SELECT count(*) INTO v_audits FROM financial_app.audit_changes
  WHERE entity_type='budget' AND field_name='manual_amount_cents';
  IF v_total IS DISTINCT FROM 222222 OR v_category IS NOT NULL OR v_audits<>4 THEN
    RAISE EXCEPTION 'AP2_UPDATE_CLEAR_NOT_APPLIED total=% category=% audit=%',v_total,v_category,v_audits;
  END IF;
END $mutations$;

-- Cross-tenant check in same connection after the write, before COMMIT.
SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $isolation$
BEGIN
  IF (SELECT count(*) FROM financial_app.budgets WHERE month='2026-09')<>2
     OR (SELECT manual_amount_cents FROM financial_app.budgets
       WHERE month='2026-09' AND category_id IS NULL) IS DISTINCT FROM 654321
  THEN
    RAISE EXCEPTION 'AP1_UPDATE_CLEAR_CROSSED_WORKSPACE';
  END IF;
END $isolation$;

COMMIT;
\echo 'AP1AP2_DISPOSABLE|update_clear_committed=true|source_untouched=true'
