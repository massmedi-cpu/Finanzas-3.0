-- AP1/AP2 movement readback through a separate PostgreSQL session.
-- READ ONLY, disposable CI database exclusively, no production originals.
\set ON_ERROR_STOP on
DO $ci_guard$
BEGIN
  IF current_database() <> 'financial_app_pre001_disposable' THEN
    RAISE EXCEPTION 'AP1AP2_FIXTURE_MUST_USE_DISPOSABLE_LOCAL_DB';
  END IF;
END $ci_guard$;
BEGIN READ ONLY;
SET LOCAL ROLE financial_app_gateway;
SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

DO $read_a$
DECLARE v_source record; v_movement record; v_override record;
  v_tag_count int; v_audit_count int; v_cross_count int;
BEGIN
  SELECT * INTO v_source FROM financial_app.transaction_source_records
    WHERE id='aa110000-0000-4000-8000-000000000055';
  SELECT * INTO v_movement FROM financial_app.transactions
    WHERE id='aa110000-0000-4000-8000-000000000066';
  SELECT * INTO v_override FROM financial_app.transaction_overrides
    WHERE transaction_id='aa110000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_tag_count FROM financial_app.transaction_tags
    WHERE transaction_id='aa110000-0000-4000-8000-000000000066'
      AND tag_key IN ('personal','supermercado');
  SELECT count(*) INTO v_audit_count FROM financial_app.audit_changes
    WHERE entity_type='transaction'
      AND entity_id='aa110000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_cross_count FROM financial_app.transactions
    WHERE id='bb220000-0000-4000-8000-000000000066';
  IF v_source.amount_cents IS DISTINCT FROM -3456
    OR v_source.concept_original IS DISTINCT FROM 'ORIGINAL BANK SOURCE A'
    OR v_movement.amount_cents IS DISTINCT FROM -3456
    OR v_movement.concept_normalized IS DISTINCT FROM 'ORIGINAL BANK SOURCE A'
    OR v_override.concept_override IS DISTINCT FROM 'COMPRA REVISADA A'
    OR v_override.note IS DISTINCT FROM 'Nota personal A'
    OR v_override.category_id_override IS DISTINCT FROM 'aa110000-0000-4000-8000-000000000033'::uuid
    OR v_override.category_override_set IS DISTINCT FROM true
    OR v_override.excluded_from_analytics IS DISTINCT FROM true
    OR v_tag_count<>2 OR v_audit_count<>5 OR v_cross_count<>0 THEN
    RAISE EXCEPTION 'AP2_TRANSACTION_A_DURABILITY_FAILED original=% override=% tags=% audits=% cross=%',
      v_source.amount_cents,v_override.concept_override,v_tag_count,v_audit_count,v_cross_count;
  END IF;
  RAISE NOTICE 'AP1AP2_MOVEMENTS|tenant=A|source_amount_cents=-3456|user_override_persisted=true|tags_persisted=2|audit_events=5|cross_tenant=0';
END $read_a$;

SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $read_b$
DECLARE v_source record; v_movement record; v_override record;
  v_tag_count int; v_audit_count int; v_cross_count int;
BEGIN
  SELECT * INTO v_source FROM financial_app.transaction_source_records
    WHERE id='bb220000-0000-4000-8000-000000000055';
  SELECT * INTO v_movement FROM financial_app.transactions
    WHERE id='bb220000-0000-4000-8000-000000000066';
  SELECT * INTO v_override FROM financial_app.transaction_overrides
    WHERE transaction_id='bb220000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_tag_count FROM financial_app.transaction_tags
    WHERE transaction_id='bb220000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_audit_count FROM financial_app.audit_changes
    WHERE entity_type='transaction'
      AND entity_id='bb220000-0000-4000-8000-000000000066';
  SELECT count(*) INTO v_cross_count FROM financial_app.transactions
    WHERE id='aa110000-0000-4000-8000-000000000066';
  IF v_source.amount_cents IS DISTINCT FROM -7890
    OR v_source.concept_original IS DISTINCT FROM 'ORIGINAL BANK SOURCE B'
    OR v_movement.amount_cents IS DISTINCT FROM -7890
    OR v_override.note IS DISTINCT FROM 'Nota personal B'
    OR v_tag_count<>0 OR v_audit_count<>1 OR v_cross_count<>0 THEN
    RAISE EXCEPTION 'AP2_TRANSACTION_B_DURABILITY_FAILED original=% tags=% audits=% cross=%',
      v_source.amount_cents,v_tag_count,v_audit_count,v_cross_count;
  END IF;
  RAISE NOTICE 'AP1AP2_MOVEMENTS|tenant=B|source_amount_cents=-7890|own_note_persisted=true|other_tags=0|audit_events=1|cross_tenant=0';
END $read_b$;

-- One more scope switch on the same connection: no stale source/override/tag.
SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
DO $back_a$
BEGIN
  IF (SELECT count(*) FROM financial_app.transaction_tags WHERE tag_key='supermercado')<>1
    OR EXISTS(SELECT 1 FROM financial_app.transaction_overrides
       WHERE transaction_id='bb220000-0000-4000-8000-000000000066') THEN
    RAISE EXCEPTION 'AP1_TRANSACTION_SCOPE_STICKINESS';
  END IF;
END $back_a$;
ROLLBACK;
\echo 'AP1AP2_MOVEMENTS|separate_connection_readback=true|source_unchanged=true|rls_isolation=true'
