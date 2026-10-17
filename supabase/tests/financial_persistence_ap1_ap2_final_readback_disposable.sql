-- AP1/AP2 fourth new psql session: independently verify update and clear COMMIT.
-- No client originals or remote Supabase connections. Read-only throughout.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'financial_app_pre001_disposable' THEN
    RAISE EXCEPTION 'AP1AP2_FIXTURE_MUST_USE_DISPOSABLE_LOCAL_DB';
  END IF;
END $guard$;
BEGIN READ ONLY;
SET LOCAL ROLE financial_app_gateway;

SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

DO $verify_a$
DECLARE v_snapshot jsonb; v_audits int; v_total bigint; v_category bigint;
BEGIN
  v_snapshot:=financial_app.budget_month_snapshot('2026-09');
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
    WHERE month='2026-09' AND category_id='aa110000-0000-4000-8000-000000000033'::uuid;
  SELECT count(*) INTO v_audits FROM financial_app.audit_changes
    WHERE entity_type='budget' AND field_name='manual_amount_cents';
  IF v_total IS DISTINCT FROM 222222 OR v_category IS NOT NULL OR v_audits<>4
    OR (v_snapshot->'total'->>'manualAmountCents')::bigint IS DISTINCT FROM 222222
  THEN
    RAISE EXCEPTION 'AP2_NEW_SESSION_UPDATE_CLEAR_NOT_DURABLE total=% category=% audits=%',v_total,v_category,v_audits;
  END IF;
  IF (SELECT count(*) FROM financial_app.transaction_source_records)<>0 THEN
    RAISE EXCEPTION 'AP1_A_ORIGINAL_SOURCE_CHANGED';
  END IF;
  RAISE NOTICE 'AP1AP2_DISPOSABLE|tenant=A|update_durable=true|clear_durable=true|audit_entries=4';
END $verify_a$;

SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $verify_b$
DECLARE v_total bigint; v_category bigint; v_audits int;
BEGIN
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
    WHERE month='2026-09' AND category_id='bb220000-0000-4000-8000-000000000044'::uuid;
  SELECT count(*) INTO v_audits FROM financial_app.audit_changes
    WHERE entity_type='budget' AND field_name='manual_amount_cents';
  IF v_total IS DISTINCT FROM 654321 OR v_category IS DISTINCT FROM 45678 OR v_audits<>2 THEN
    RAISE EXCEPTION 'AP1_B_CHANGED_BY_A_WRITES total=% category=% audits=%',v_total,v_category,v_audits;
  END IF;
  IF (SELECT count(*) FROM financial_app.transaction_source_records)<>0 THEN
    RAISE EXCEPTION 'AP1_B_ORIGINAL_SOURCE_CHANGED';
  END IF;
  RAISE NOTICE 'AP1AP2_DISPOSABLE|tenant=B|unchanged_after_A_edits=true|audit_entries=2';
END $verify_b$;

ROLLBACK;
\echo 'AP1AP2_DISPOSABLE|complete_create_edit_clear_reload=true|separate_connections=true'
