-- AP2: restore only user edits to inherited bank values; never change the source.
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

-- The actual transactional business functions used by the API.
DO $clear_edits$
DECLARE v_patch jsonb; v_tags jsonb;
BEGIN
  v_patch := financial_app.apply_transaction_override_patch(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    '{"concept":null,"categoryMode":"inherit","note":null,"excludedFromAnalytics":false}'::jsonb
  );
  v_tags := financial_app.set_transaction_tags(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    ARRAY[]::text[]
  );
  IF (v_patch->>'changedTransactions')::integer<>1
    OR (v_tags->>'changedTransactions')::integer<>1 THEN
    RAISE EXCEPTION 'AP2_MOVEMENT_CLEAR_NOT_DETECTED';
  END IF;

  -- A repeated clear is idempotent and leaves audit unchanged.
  v_patch := financial_app.apply_transaction_override_patch(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    '{"concept":null,"categoryMode":"inherit","note":null,"excludedFromAnalytics":false}'::jsonb
  );
  v_tags := financial_app.set_transaction_tags(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    ARRAY[]::text[]
  );
  IF (v_patch->>'changedTransactions')::integer<>0
    OR (v_tags->>'changedTransactions')::integer<>0 THEN
    RAISE EXCEPTION 'AP2_MOVEMENT_CLEAR_RETRY_NOT_IDEMPOTENT';
  END IF;
END $clear_edits$;

DO $source_and_override$
DECLARE v_source_amount bigint; v_movement_amount bigint; v_override_count int; v_tag_count int;
BEGIN
  SELECT amount_cents INTO v_source_amount FROM financial_app.transaction_source_records
    WHERE id='aa110000-0000-4000-8000-000000000055';
  SELECT amount_cents INTO v_movement_amount FROM financial_app.transactions
    WHERE id='aa110000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_override_count FROM financial_app.transaction_overrides
    WHERE transaction_id='aa110000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_tag_count FROM financial_app.transaction_tags
    WHERE transaction_id='aa110000-0000-4000-8000-000000000066';
  IF v_source_amount IS DISTINCT FROM -3456 OR v_movement_amount IS DISTINCT FROM -3456
    OR v_override_count<>0 OR v_tag_count<>0 THEN
    RAISE EXCEPTION 'AP2_CLEAR_MODIFIED_BANK_SOURCE_OR_LEFT_OVERRIDE';
  END IF;
END $source_and_override$;

-- The B movement and bank record must stay unchanged after all A edits.
SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $tenant_b_unchanged$
BEGIN
  IF (SELECT note FROM financial_app.transaction_overrides
       WHERE transaction_id='bb220000-0000-4000-8000-000000000066') IS DISTINCT FROM 'Nota personal B'
    OR (SELECT amount_cents FROM financial_app.transaction_source_records
       WHERE id='bb220000-0000-4000-8000-000000000055') IS DISTINCT FROM -7890 THEN
    RAISE EXCEPTION 'AP1_MOVEMENT_A_CLEAR_TOUCHED_TENANT_B';
  END IF;
END $tenant_b_unchanged$;

COMMIT;
\echo 'AP1AP2_MOVEMENTS|clear_committed=true|clear_retry_idempotent=true|bank_source_unchanged=true'
