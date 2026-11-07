-- AP1/AP2 movements: real business functions on synthetic fixtures only.
-- Always ABORT before any mutation unless this is the CI disposable database.
\set ON_ERROR_STOP on
DO $ci_guard$
BEGIN
  IF current_database() <> 'financial_app_pre001_disposable' THEN
    RAISE EXCEPTION 'AP1AP2_FIXTURE_MUST_USE_DISPOSABLE_LOCAL_DB';
  END IF;
END $ci_guard$;

BEGIN;
SET LOCAL ROLE financial_app_gateway;
SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

INSERT INTO financial_app.transaction_source_records(
  id,source_file_id,source_sheet_id,source_row_key,source_row_identity,
  source_fingerprint,source_payload,bank_date,concept_original,
  amount_cents,balance_after_cents,account_external_key
) VALUES (
  'aa110000-0000-4000-8000-000000000055',
  '__ap1ap2_disposable__','synthetic','A-1','__ap1ap2_disposable__::A-1',
  md5('ap1ap2:A')||md5('source:A'),
  '{"synthetic":true,"payment":false}'::jsonb,
  date '2026-09-05','ORIGINAL BANK SOURCE A',-3456,NULL,'synthetic-A'
);
INSERT INTO financial_app.transactions(
  id,source_record_id,source_row_identity,account_id,bank_date,
  concept_normalized,kind,amount_cents,review_state,duplicate_state
) VALUES (
  'aa110000-0000-4000-8000-000000000066',
  'aa110000-0000-4000-8000-000000000055','__ap1ap2_disposable__::A-1',
  'aa110000-0000-4000-8000-000000000011',date '2026-09-05',
  'ORIGINAL BANK SOURCE A','expense',-3456,'confirmed','none'
);

-- Only overrides and tags are editable. Underlying source is immutable.
DO $bank_source_is_read_only$
DECLARE v_block_update boolean := false; v_block_delete boolean := false;
BEGIN
  BEGIN
    UPDATE financial_app.transaction_source_records
    SET amount_cents=-9999
    WHERE id='aa110000-0000-4000-8000-000000000055';
  EXCEPTION WHEN insufficient_privilege THEN
    v_block_update:=true;
  END;
  BEGIN
    DELETE FROM financial_app.transaction_source_records
    WHERE id='aa110000-0000-4000-8000-000000000055';
  EXCEPTION WHEN insufficient_privilege THEN
    v_block_delete:=true;
  END;
  IF NOT v_block_update OR NOT v_block_delete THEN
    RAISE EXCEPTION 'AP1_BANK_SOURCE_WRITE_NOT_BLOCKED update=% delete=%',
      v_block_update,v_block_delete;
  END IF;
END $bank_source_is_read_only$;

SELECT financial_app.apply_transaction_override_patch(
  ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
  '{"concept":"COMPRA REVISADA A","categoryMode":"set","categoryId":"aa110000-0000-4000-8000-000000000033","note":"Nota personal A","excludedFromAnalytics":true}'::jsonb
);
SELECT financial_app.set_transaction_tags(
  ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
  ARRAY['Supermercado','Personal']::text[]
);
-- Idempotent retry must not duplicate logs.
DO $idempotency$
DECLARE v_result jsonb; v_result_tags jsonb;
BEGIN
  v_result := financial_app.apply_transaction_override_patch(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    '{"concept":"COMPRA REVISADA A","categoryMode":"set","categoryId":"aa110000-0000-4000-8000-000000000033","note":"Nota personal A","excludedFromAnalytics":true}'::jsonb
  );
  v_result_tags := financial_app.set_transaction_tags(
    ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
    ARRAY['Supermercado','Personal']::text[]
  );
  IF (v_result->>'changedTransactions')::integer<>0
    OR (v_result_tags->>'changedTransactions')::integer<>0 THEN
    RAISE EXCEPTION 'AP2_TRANSACTION_RETRY_NOT_IDEMPOTENT';
  END IF;
END $idempotency$;

-- Simulate two workspaces using the real gateway RLS in the same session.
SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $cross_tenant$
DECLARE v_block_override boolean:=false; v_block_tag boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM financial_app.transactions
      WHERE id='aa110000-0000-4000-8000-000000000066')
     OR EXISTS(SELECT 1 FROM financial_app.transaction_source_records
      WHERE id='aa110000-0000-4000-8000-000000000055')
     OR EXISTS(SELECT 1 FROM financial_app.transaction_overrides
      WHERE transaction_id='aa110000-0000-4000-8000-000000000066')
     OR EXISTS(SELECT 1 FROM financial_app.transaction_tags
      WHERE transaction_id='aa110000-0000-4000-8000-000000000066') THEN
    RAISE EXCEPTION 'AP1_CROSS_TENANT_TRANSACTION_READ_LEAK';
  END IF;
  BEGIN
    PERFORM financial_app.apply_transaction_override_patch(
      ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
      '{"note":"ILLEGAL TENANT B"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_block_override:=true;
  END;
  BEGIN
    PERFORM financial_app.set_transaction_tags(
      ARRAY['aa110000-0000-4000-8000-000000000066'::uuid],
      ARRAY['ILLEGAL TENANT B']::text[]
    );
  EXCEPTION WHEN OTHERS THEN
    v_block_tag:=true;
  END;
  IF NOT v_block_override OR NOT v_block_tag THEN
    RAISE EXCEPTION 'AP1_CROSS_TENANT_TRANSACTION_WRITE_ACCEPTED override=% tags=%',
      v_block_override,v_block_tag;
  END IF;
END $cross_tenant$;

INSERT INTO financial_app.transaction_source_records(
  id,source_file_id,source_sheet_id,source_row_key,source_row_identity,
  source_fingerprint,source_payload,bank_date,concept_original,
  amount_cents,balance_after_cents,account_external_key
) VALUES (
  'bb220000-0000-4000-8000-000000000055',
  '__ap1ap2_disposable__','synthetic','B-1','__ap1ap2_disposable__::B-1',
  md5('ap1ap2:B')||md5('source:B'),
  '{"synthetic":true,"payment":false}'::jsonb,
  date '2026-09-06','ORIGINAL BANK SOURCE B',-7890,NULL,'synthetic-B'
);
INSERT INTO financial_app.transactions(
  id,source_record_id,source_row_identity,account_id,bank_date,
  concept_normalized,kind,amount_cents,review_state,duplicate_state
) VALUES (
  'bb220000-0000-4000-8000-000000000066',
  'bb220000-0000-4000-8000-000000000055','__ap1ap2_disposable__::B-1',
  'bb220000-0000-4000-8000-000000000022',date '2026-09-06',
  'ORIGINAL BANK SOURCE B','expense',-7890,'confirmed','none'
);
SELECT financial_app.apply_transaction_override_patch(
  ARRAY['bb220000-0000-4000-8000-000000000066'::uuid],
  '{"note":"Nota personal B"}'::jsonb
);
COMMIT;
\echo 'AP1AP2_MOVEMENTS|committed=true|cross_tenant_writes_blocked=true|source_immutable=true|retry_idempotent=true'
