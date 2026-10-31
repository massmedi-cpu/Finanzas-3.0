-- AP1/AP2: new connection independently verifies user reset and source integrity.
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

DO $read_a$
DECLARE v_source record; v_mov record; v_own_override_count int; v_own_tags_count int;
  v_own_audits int;
BEGIN
  SELECT * INTO v_source FROM financial_app.transaction_source_records
    WHERE id='aa110000-0000-4000-8000-000000000055';
  SELECT * INTO v_mov FROM financial_app.transactions
    WHERE id='aa110000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_own_override_count FROM financial_app.transaction_overrides
    WHERE transaction_id=v_mov.id;
  SELECT count(*) INTO v_own_tags_count FROM financial_app.transaction_tags
    WHERE transaction_id=v_mov.id;
  SELECT count(*) INTO v_own_audits FROM financial_app.audit_changes
    WHERE entity_type='transaction' AND entity_id=v_mov.id
      AND field_name IN ('concept_override','category_override','excluded_from_analytics','note','tags');
  IF v_source.amount_cents IS DISTINCT FROM -3456
     OR v_source.concept_original IS DISTINCT FROM 'ORIGINAL BANK SOURCE A'
     OR v_mov.amount_cents IS DISTINCT FROM -3456
     OR v_mov.concept_normalized IS DISTINCT FROM 'ORIGINAL BANK SOURCE A'
     OR v_own_override_count<>0 OR v_own_tags_count<>0 OR v_own_audits<>10 THEN
    RAISE EXCEPTION 'AP2_MOVEMENT_RESET_NOT_PERSISTED override=% tags=% audits=%',
      v_own_override_count,v_own_tags_count,v_own_audits;
  END IF;
  RAISE NOTICE 'AP1AP2_MOVEMENTS|tenant=A|reset_durable=true|original_intact=true|overrides=0|tags=0|audit_events=10';
END $read_a$;

SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $read_b$
DECLARE v_source record; v_override record; v_own_audits int; v_cross_rows int;
BEGIN
  SELECT * INTO v_source FROM financial_app.transaction_source_records
    WHERE id='bb220000-0000-4000-8000-000000000055';
  SELECT * INTO v_override FROM financial_app.transaction_overrides
    WHERE transaction_id='bb220000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_own_audits FROM financial_app.audit_changes
    WHERE entity_type='transaction' AND entity_id='bb220000-0000-4000-8000-000000000066'
      AND field_name='note';
  SELECT count(*) INTO v_cross_rows FROM financial_app.transactions
    WHERE id='aa110000-0000-4000-8000-000000000066';
  IF v_source.amount_cents IS DISTINCT FROM -7890
    OR v_override.note IS DISTINCT FROM 'Nota personal B'
    OR v_own_audits<>1 OR v_cross_rows<>0 THEN
    RAISE EXCEPTION 'AP1_B_CHANGED_AFTER_A_RESET own_audits=% cross=%',
      v_own_audits,v_cross_rows;
  END IF;
  RAISE NOTICE 'AP1AP2_MOVEMENTS|tenant=B|unchanged_after_A_reset=true|cross_tenant=0';
END $read_b$;
ROLLBACK;
\echo 'AP1AP2_MOVEMENTS|create_edit_reload_clear_reload=true|source_immutable=true|new_connections=true'
