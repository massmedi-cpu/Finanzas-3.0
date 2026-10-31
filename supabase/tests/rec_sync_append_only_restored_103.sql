-- REC-SYNC-410: production-v10.0.103 PG17 restore ONLY, NEVER live Supabase.
-- Twenty synthetic observations, idempotence, historic conflict atomic rollback,
-- cross-workspace denial and zero residue. Sensitive originals are never printed.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'financial_app_production_backup_restore_check'
    OR NOT EXISTS (SELECT 1 FROM financial_app.transaction_source_records)
    OR NOT EXISTS (SELECT 1 FROM financial_app.transactions)
  THEN RAISE EXCEPTION 'REC_SYNC_410_AUTHENTIC_DISPOSABLE_RESTORE_REQUIRED'; END IF;
END $guard$;
BEGIN;
INSERT INTO financial_app.workspaces(id,name) VALUES
  ('a0f41000-0000-4000-8000-000000000001','REC SYNC synthetic A'),
  ('a0f41000-0000-4000-8000-000000000002','REC SYNC synthetic B');
SELECT pg_catalog.set_config('financial_app.workspace_id','a0f41000-0000-4000-8000-000000000001',true);
-- The temp helper is SECURITY INVOKER and calls the ACTUAL SQL ingestion routine.
CREATE FUNCTION pg_temp.rec_sync_fixture(p_number integer,p_revision boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS $fixture$
DECLARE
  v_key text := 'SYN-' || pg_catalog.lpad(p_number::text,3,'0');
  v_source text := '__rec_sync_410_synthetic_only__';
  v_result record; v_payload jsonb; v_fingerprint text;
BEGIN
  IF p_number<1 OR p_number>20 THEN RAISE EXCEPTION 'REC_SYNC_410_INVALID_ROW'; END IF;
  v_payload:=pg_catalog.jsonb_build_object(
    'ID origen',v_key,'Fecha','21/10/2026','Hora',NULL,
    'Producto o cuenta','REC SYNC synthetic checking','Entidad','Synthetic Bank',
    'Identificador','****0000','Tipo de producto','Cuenta bancaria',
    'Tipo de movimiento','Gasto','Categoría',NULL,'Subcategoría',NULL,
    'Concepto original','REC SYNC synthetic movement',
    'Concepto normalizado','REC SYNC synthetic movement',
    'Comercio o contraparte',NULL,'Importe (€)',-1*p_number,'Saldo (€)',NULL,
    'Canal',NULL,'Cuenta de origen',NULL,'Cuenta de destino',NULL,
    'Conciliado','No','Revisar','No',
    'Notas',CASE WHEN p_revision THEN 'UNAUTHORIZED REVISION' ELSE NULL END,
    'Fuente','REC SYNC synthetic fixture'
  );
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_payload))<>22 THEN
    RAISE EXCEPTION 'REC_SYNC_410_22_COLUMNS_REQUIRED';
  END IF;
  v_fingerprint:=pg_catalog.md5('rec410-original:'||v_key||p_revision::text)
    ||pg_catalog.md5('rec410-typed:'||v_key||p_revision::text);
  SELECT * INTO STRICT v_result FROM financial_app.ingest_source_observation(
    v_source,'synthetic-sheet',v_key,
    v_source||'::synthetic-sheet::'||v_key,v_fingerprint,v_payload,
    DATE '2026-10-21','REC SYNC synthetic movement','REC SYNC synthetic movement',
    (-100*p_number)::bigint,NULL::bigint,'REC SYNC synthetic checking',
    'expense','pending',pg_catalog.now()
  );
  IF v_result.transaction_id IS NULL OR v_result.source_record_id IS NULL THEN
    RAISE EXCEPTION 'REC_SYNC_410_INCOMPLETE_RECEIPT';
  END IF;
  RETURN v_result.action;
END $fixture$;
SET LOCAL ROLE financial_app_gateway;
SELECT pg_catalog.set_config('financial_app.workspace_id','a0f41000-0000-4000-8000-000000000001',true);
SELECT financial_app.ensure_source_account_mapping(
  '__rec_sync_410_synthetic_only__','REC SYNC synthetic checking',
  'REC SYNC synthetic checking','Synthetic Bank','checking',0::bigint,'active','****0000'
);
DO $conflict$
DECLARE n integer; disposition text; expected boolean:=false;
BEGIN
  -- The nested PL/pgSQL block is a subtransaction (same atomicity as sql.begin).
  BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('financial_app.source_sync:__rec_sync_410_synthetic_only__'));
    INSERT INTO financial_app.sync_runs(source_file_id,status,rows_seen,schema_fingerprint)
    VALUES ('__rec_sync_410_synthetic_only__','started',20,pg_catalog.repeat('a',64));
    FOR n IN 1..20 LOOP
      disposition:=pg_temp.rec_sync_fixture(n);
      IF disposition<>'insert' THEN RAISE EXCEPTION 'REC_SYNC_410_WRONG_INSERT'; END IF;
    END LOOP;
    INSERT INTO financial_app.sync_cursors(source_file_id,source_sheet_id,last_source_row_key)
    VALUES ('__rec_sync_410_synthetic_only__','synthetic-sheet','SYN-020');
    disposition:=pg_temp.rec_sync_fixture(1,true);
    IF disposition<>'append_revision' THEN RAISE EXCEPTION 'REC_SYNC_410_CONFLICT_NOT_DETECTED'; END IF;
    -- This is precisely the gateway's fail-closed disposition guard.
    RAISE EXCEPTION 'REC_SYNC_410_EXPECTED_HISTORIC_ABORT';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'REC_SYNC_410_EXPECTED_HISTORIC_ABORT' THEN RAISE; END IF;
    expected:=true;
  END;
  IF NOT expected
    OR EXISTS(SELECT 1 FROM financial_app.transaction_source_records WHERE source_file_id='__rec_sync_410_synthetic_only__')
    OR EXISTS(SELECT 1 FROM financial_app.transactions WHERE source_row_identity LIKE '__rec_sync_410_synthetic_only__::%')
    OR EXISTS(SELECT 1 FROM financial_app.sync_runs WHERE source_file_id='__rec_sync_410_synthetic_only__')
    OR EXISTS(SELECT 1 FROM financial_app.sync_cursors WHERE source_file_id='__rec_sync_410_synthetic_only__')
  THEN RAISE EXCEPTION 'REC_SYNC_410_PARTIAL_CONFLICT_BATCH_SURVIVED'; END IF;
END $conflict$;
DO $success$
DECLARE n integer; disposition text;
BEGIN
  FOR n IN 1..20 LOOP
    disposition:=pg_temp.rec_sync_fixture(n);
    IF disposition<>'insert' THEN RAISE EXCEPTION 'REC_SYNC_410_NOT_APPEND_ONLY'; END IF;
  END LOOP;
  FOR n IN 1..20 LOOP
    disposition:=pg_temp.rec_sync_fixture(n);
    IF disposition<>'skip' THEN RAISE EXCEPTION 'REC_SYNC_410_REPLAY_NOT_IDEMPOTENT'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM financial_app.transaction_source_records
      WHERE source_file_id='__rec_sync_410_synthetic_only__')<>20
    OR (SELECT count(*) FROM financial_app.transactions
      WHERE source_row_identity LIKE '__rec_sync_410_synthetic_only__::%')<>20
    OR (SELECT coalesce(sum(amount_cents),0) FROM financial_app.transactions
      WHERE source_row_identity LIKE '__rec_sync_410_synthetic_only__::%')<>-21000
    OR EXISTS(SELECT 1 FROM financial_app.transaction_source_records
      WHERE source_file_id='__rec_sync_410_synthetic_only__'
        AND supersedes_source_record_id IS NOT NULL)
  THEN RAISE EXCEPTION 'REC_SYNC_410_FINANCIAL_PARITY_FAILED'; END IF;
END $success$;
SELECT pg_catalog.set_config('financial_app.workspace_id','a0f41000-0000-4000-8000-000000000002',true);
DO $isolation$
BEGIN
  IF EXISTS(SELECT 1 FROM financial_app.transaction_source_records WHERE source_file_id='__rec_sync_410_synthetic_only__')
    OR EXISTS(SELECT 1 FROM financial_app.transactions WHERE source_row_identity LIKE '__rec_sync_410_synthetic_only__::%')
  THEN RAISE EXCEPTION 'REC_SYNC_410_CROSS_WORKSPACE_LEAK'; END IF;
END $isolation$;
ROLLBACK;
DO $residue$
BEGIN
  IF EXISTS(SELECT 1 FROM financial_app.transaction_source_records WHERE source_file_id='__rec_sync_410_synthetic_only__')
    OR EXISTS(SELECT 1 FROM financial_app.workspaces WHERE id IN
      ('a0f41000-0000-4000-8000-000000000001'::uuid,'a0f41000-0000-4000-8000-000000000002'::uuid))
  THEN RAISE EXCEPTION 'REC_SYNC_410_RESTORED_DB_NOT_CLEAN'; END IF;
  RAISE NOTICE 'REC_SYNC_AP5_REHEARSAL|status=ok|inserts=20|replay_skips=20|conflict_rolls_back=true|workspace_isolated=true|no_residue=true';
END $residue$;
