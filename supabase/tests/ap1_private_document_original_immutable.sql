-- AP-1 private document immutability · PostgreSQL 17 synthetic laboratory.
-- This is NOT production and no original bank/Drive data is read.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '90s';
INSERT INTO financial_app.workspaces(id,name)
VALUES ('a0d30000-0000-4000-8000-000000000001','AP1 PRIVATE ORIGINAL SYNTHETIC');
SELECT pg_catalog.set_config('financial_app.workspace_id','a0d30000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','80000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SET LOCAL ROLE financial_app_gateway;

DO $verify$
DECLARE
  v_path text := 'uploads/a0d30000-0000-4000-8000-000000000001/a0d30000-0000-4000-8000-000000000002.pdf';
  v_id uuid;
  v_replayed_id uuid;
  v_document record;
BEGIN
  v_id := (financial_app.register_document(
    'invoice','AP1 original.pdf','application/pdf','supabase',v_path,null,12345,null
  )#>>'{document,id}')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'AP1 private fixture did not register'; END IF;

  PERFORM financial_app.update_document_metadata(
    v_id,'ticket','2026-10-01'::date,'Comercio revisado',5000,'Metadatos confirmados'
  );

  v_replayed_id := (financial_app.register_document(
    'invoice','AP1 original.pdf','application/pdf','supabase',v_path,null,12345,null
  )#>>'{document,id}')::uuid;
  IF v_replayed_id IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'AP1 idempotency created duplicate row'; END IF;

  FOR v_document IN SELECT * FROM (VALUES
    ('AP1 otro nombre.pdf','application/pdf',12345::bigint),
    ('AP1 original.pdf','image/png',12345::bigint),
    ('AP1 original.pdf','application/pdf',12346::bigint)
  ) AS proposed(name,mime,bytes) LOOP
    BEGIN
      PERFORM financial_app.register_document(
        'invoice',v_document.name,v_document.mime,'supabase',v_path,null,v_document.bytes,null
      );
      RAISE EXCEPTION 'AP1 replay rewrote original identity';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'document_private_original_immutable' THEN RAISE; END IF;
    END;
  END LOOP;

  BEGIN
    UPDATE financial_app.documents SET storage_key='uploads/other/forged.pdf' WHERE id=v_id;
    RAISE EXCEPTION 'AP1 storage identity rewritten';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'document_original_storage_identity_immutable' THEN RAISE; END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM financial_app.documents
    WHERE id=v_id AND original_file_name='AP1 original.pdf'
      AND mime_type='application/pdf' AND size_bytes=12345
      AND type='ticket' AND issuer_name='Comercio revisado'
      AND total_cents=5000 AND notes='Metadatos confirmados'
      AND storage_key=v_path
  ) THEN RAISE EXCEPTION 'AP1 replay damaged the reviewed original'; END IF;

  -- Google Drive originals have their own read-only source inventory:
  -- a new revision of the SAME authorised file may update metadata, but
  -- never silently change its provider or immutable file identifier.
  PERFORM financial_app.register_document(
    'other','Drive v1.pdf','application/pdf','google_drive',
    'AP1-GOOGLE-FILE-ID','AP1-GOOGLE-FILE-ID',1000,null
  );
  PERFORM financial_app.register_document(
    'other','Drive v2.pdf','application/pdf','google_drive',
    'AP1-GOOGLE-FILE-ID','AP1-GOOGLE-FILE-ID',1200,null
  );
  IF NOT EXISTS(
    SELECT 1 FROM financial_app.documents
    WHERE storage_provider='google_drive' AND storage_key='AP1-GOOGLE-FILE-ID'
    AND original_file_name='Drive v2.pdf' AND size_bytes=1200
  ) THEN RAISE EXCEPTION 'AP1 valid Drive revision was blocked'; END IF;

  -- REC-AP1-337: register_document keys its UPSERT by storage_key. A
  -- different source_drive_file_id with the SAME key previously passed the
  -- migration trigger, silently replacing the authoritative Drive identity.
  BEGIN
    PERFORM financial_app.register_document(
      'other','Drive forged.pdf','application/pdf','google_drive',
      'AP1-GOOGLE-FILE-ID','AP1-DIFFERENT-FILE-ID',1200,null
    );
    RAISE EXCEPTION 'AP1 Drive upsert changed authoritative identity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'document_original_storage_identity_immutable' THEN RAISE; END IF;
  END;

  -- Direct gateway or legacy SQL must not bypass the same invariant.
  BEGIN
    UPDATE financial_app.documents
      SET source_drive_file_id='AP1-DIFFERENT-FILE-ID'
      WHERE storage_provider='google_drive' AND storage_key='AP1-GOOGLE-FILE-ID';
    RAISE EXCEPTION 'AP1 Drive SQL update changed authoritative identity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'document_original_storage_identity_immutable' THEN RAISE; END IF;
  END;

  IF NOT EXISTS(
    SELECT 1 FROM financial_app.documents
    WHERE storage_provider='google_drive' AND storage_key='AP1-GOOGLE-FILE-ID'
      AND source_drive_file_id='AP1-GOOGLE-FILE-ID'
      AND original_file_name='Drive v2.pdf' AND size_bytes=1200
  ) THEN RAISE EXCEPTION 'AP1 Drive rejected replay changed existing metadata'; END IF;
END $verify$;
RESET ROLE;
ROLLBACK;
SELECT 'AP1_PRIVATE_ORIGINAL|status=ok|same_path_idempotent=true|private_identity_immutable=true|drive_revision_preserved=true|fixture_rolled_back=true' AS result;
