-- AP1/AP2 Drive batch atomicity: PostgreSQL 17 disposable CI only.
-- No production credentials, bank transactions or actual Google files.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '90s';
INSERT INTO financial_app.workspaces(id,name)
VALUES ('a0d30000-0000-4000-8000-000000000099','AP1 DRIVE ATOMICITY SYNTHETIC');
SELECT pg_catalog.set_config('financial_app.workspace_id','a0d30000-0000-4000-8000-000000000099',true);
SELECT pg_catalog.set_config('financial_app.user_id','80000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SET LOCAL ROLE financial_app_gateway;

DO $verify$
DECLARE
  v_steps integer := 0;
  v_first text := 'AP1-DRIVE-ATOMIC-FIRST';
  v_second text := 'AP1-DRIVE-ATOMIC-SECOND';
BEGIN
  -- A PL/pgSQL exception block creates a real database subtransaction.
  -- The first two writes must disappear when the third registration fails.
  BEGIN
    PERFORM financial_app.register_document(
      'invoice','Atomic first.pdf','application/pdf','google_drive',
      v_first,v_first,1200,null
    );
    v_steps := 1;
    PERFORM financial_app.register_document(
      'invoice','Atomic second.pdf','application/pdf','google_drive',
      v_second,v_second,1300,null
    );
    v_steps := 2;
    PERFORM financial_app.register_document(
      'invalid-document-type','Invalid third.pdf','application/pdf','google_drive',
      'AP1-DRIVE-ATOMIC-THIRD','AP1-DRIVE-ATOMIC-THIRD',1400,null
    );
    RAISE EXCEPTION 'AP1_UNEXPECTED_INVALID_DOCUMENT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'AP1_UNEXPECTED_INVALID_DOCUMENT_ACCEPTED' THEN RAISE; END IF;
    IF v_steps <> 2 THEN RAISE EXCEPTION 'AP1 valid records were not reached before failure'; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM financial_app.documents
    WHERE storage_provider='google_drive'
      AND source_drive_file_id IN (v_first,v_second,'AP1-DRIVE-ATOMIC-THIRD')
  ) THEN RAISE EXCEPTION 'AP1 partial Drive batch survived real PostgreSQL rollback'; END IF;

  -- A successful batch must persist every row inside the transaction.
  PERFORM financial_app.register_document(
    'invoice','Atomic first.pdf','application/pdf','google_drive',
    v_first,v_first,1200,null
  );
  PERFORM financial_app.register_document(
    'invoice','Atomic second.pdf','application/pdf','google_drive',
    v_second,v_second,1300,null
  );
  IF (
    SELECT count(*) FROM financial_app.documents
    WHERE storage_provider='google_drive' AND source_drive_file_id IN (v_first,v_second)
  ) <> 2 THEN RAISE EXCEPTION 'AP1 complete Drive batch did not register both rows'; END IF;
END $verify$;
RESET ROLE;
ROLLBACK;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM financial_app.workspaces
             WHERE id='a0d30000-0000-4000-8000-000000000099') THEN
    RAISE EXCEPTION 'AP1 disposable Drive fixture leaked after rollback';
  END IF;
END $verify$;
SELECT 'AP1_DRIVE_ATOMIC|status=ok|failure_rolled_back=true|complete_batch_visible=true|fixture_rolled_back=true' AS result;
