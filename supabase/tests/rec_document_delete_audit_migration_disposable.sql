\set ON_ERROR_STOP on
-- REC-DOC-DELETE-600: a real schema-migration rehearsal on the already
-- restored, disposable PostgreSQL 17 backup. The caller MUST restrict
-- PGHOST/port to loopback and MUST never pass a production credential.
-- Never call delete_document_registration on personal documents here.
-- A zero-row SQL probe and synthetic-only function calls are wrapped in
-- one ROLLBACK that also restores the original function and ACL.

SELECT md5(pg_get_functiondef('financial_app.delete_document_registration(uuid)'::regprocedure))
         AS baseline_function_hash,
       has_function_privilege('anon',
         'financial_app.delete_document_registration(uuid)', 'EXECUTE')
         AS baseline_anon_execute,
       has_function_privilege('authenticated',
         'financial_app.delete_document_registration(uuid)', 'EXECUTE')
         AS baseline_auth_execute,
       has_function_privilege('service_role',
         'financial_app.delete_document_registration(uuid)', 'EXECUTE')
         AS baseline_service_execute
\gset

BEGIN;
\i supabase/migrations/20261112191500_rec_document_delete_audit_schema.sql

DO $verify_disposable_audit$
DECLARE
  v_source text;
  v_secure boolean;
BEGIN
  SELECT p.prosrc,
         p.prosecdef AND p.proconfig = ARRAY['search_path=""']::text[]
    INTO v_source, v_secure
  FROM pg_proc p
  WHERE p.oid = 'financial_app.delete_document_registration(uuid)'::regprocedure;

  IF v_source IS NULL OR NOT COALESCE(v_secure, false)
      OR position('actor_type' IN v_source) > 0
      OR position('insert into financial_app.audit_changes' IN v_source) = 0
      OR position('document_delete_preflight' IN v_source) = 0 THEN
    RAISE EXCEPTION 'rec_doc_delete_migration_invalid_function';
  END IF;

  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'financial_app'
      AND table_name = 'audit_changes'
      AND column_name = ANY(ARRAY[
        'workspace_id', 'entity_type', 'entity_id', 'field_name',
        'original_value', 'new_value', 'change_origin'
      ])
  ) <> 7 THEN
    RAISE EXCEPTION 'rec_doc_delete_migration_audit_columns_missing';
  END IF;

  IF has_function_privilege('anon',
        'financial_app.delete_document_registration(uuid)', 'EXECUTE')
      OR has_function_privilege('authenticated',
        'financial_app.delete_document_registration(uuid)', 'EXECUTE')
      OR NOT has_function_privilege('service_role',
        'financial_app.delete_document_registration(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rec_doc_delete_migration_acl_unsafe';
  END IF;
END;
$verify_disposable_audit$;

-- Force PostgreSQL to resolve every audit-column name and type without
-- inserting a row, creating a document or touching a personal record.
INSERT INTO financial_app.audit_changes (
  workspace_id, entity_type, entity_id, field_name,
  original_value, new_value, change_origin
)
SELECT workspace_id, entity_type, entity_id, field_name,
       original_value, new_value, change_origin
FROM financial_app.audit_changes
WHERE FALSE;

-- REC-DOC-DELETE-601: exercise the repaired function using ONLY ephemeral
-- synthetic rows in the disposable PG17 restore. No private originals,
-- imported bank records or existing document IDs are accessed or deleted.
DO $synthetic_document_delete$
DECLARE
  v_workspace uuid := '93006000-0000-4000-8000-000000000600';
  v_outsider uuid := '93006000-0000-4000-8000-000000000699';
  v_allowed uuid := '93006000-0000-4000-8000-000000000601';
  v_confirmed uuid := '93006000-0000-4000-8000-000000000602';
  v_drive uuid := '93006000-0000-4000-8000-000000000603';
  v_preflight jsonb;
  v_result jsonb;
  v_source_count bigint;
  v_transaction_count bigint;
  v_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM financial_app.workspaces WHERE id = v_workspace)
    OR EXISTS (
      SELECT 1 FROM financial_app.documents
      WHERE id IN (v_allowed, v_confirmed, v_drive)
    ) THEN
    RAISE EXCEPTION 'rec_doc_delete_synthetic_identifier_collision';
  END IF;

  SELECT count(*) INTO v_source_count
  FROM financial_app.transaction_source_records;
  SELECT count(*) INTO v_transaction_count
  FROM financial_app.transactions;

  INSERT INTO financial_app.workspaces (id, name)
  VALUES (v_workspace, 'REC-DOC-DELETE-601 disposable fixture');
  PERFORM pg_catalog.set_config('financial_app.workspace_id', v_workspace::text, true);

  INSERT INTO financial_app.documents (
    id, workspace_id, type, status, mime_type, original_file_name,
    storage_provider, storage_key, source_drive_file_id, size_bytes
  ) VALUES
  (v_allowed, v_workspace, 'ticket', 'pending_review',
   'application/pdf', 'SYNTHETIC-601.pdf',
   'supabase', 'uploads/synthetic/601.pdf', NULL, 1024),
  (v_confirmed, v_workspace, 'invoice', 'confirmed',
   'application/pdf', 'SYNTHETIC-602.pdf',
   'supabase', 'uploads/synthetic/602.pdf', NULL, 1024),
  (v_drive, v_workspace, 'invoice', 'imported',
   'application/pdf', 'SYNTHETIC-603.pdf',
   'google_drive', 'drive/synthetic/603', 'SYNTHETIC-FILE-603', 1024);

  v_preflight := financial_app.document_delete_preflight(v_allowed);
  IF COALESCE((v_preflight->>'canDelete')::boolean, false) IS NOT TRUE
     OR v_preflight->>'documentId' <> v_allowed::text THEN
    RAISE EXCEPTION 'rec_doc_delete_pending_preflight_failed';
  END IF;

  PERFORM pg_catalog.set_config('financial_app.workspace_id', v_outsider::text, true);
  BEGIN
    PERFORM financial_app.delete_document_registration(v_allowed);
    RAISE EXCEPTION 'rec_doc_delete_cross_workspace_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'workspace_reference_mismatch' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('financial_app.workspace_id', '', true);
  BEGIN
    PERFORM financial_app.delete_document_registration(v_allowed);
    RAISE EXCEPTION 'rec_doc_delete_without_context_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'workspace_context_required' THEN RAISE; END IF;
  END;

  PERFORM pg_catalog.set_config('financial_app.workspace_id', v_workspace::text, true);
  v_preflight := financial_app.document_delete_preflight(v_confirmed);
  IF COALESCE((v_preflight->>'canDelete')::boolean, true) IS NOT FALSE
     OR v_preflight->>'reason' <> 'document_delete_confirmed_forbidden' THEN
    RAISE EXCEPTION 'rec_doc_delete_confirmed_preflight_failed';
  END IF;
  BEGIN
    PERFORM financial_app.delete_document_registration(v_confirmed);
    RAISE EXCEPTION 'rec_doc_delete_confirmed_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'document_delete_confirmed_forbidden' THEN RAISE; END IF;
  END;

  v_result := financial_app.delete_document_registration(v_allowed);
  IF v_result->>'documentId' <> v_allowed::text
     OR v_result->>'sourceOriginalPreserved' <> 'false'
     OR v_result->>'bankSource' <> 'read_only'
     OR v_result->>'deleted' <> 'true'
     OR EXISTS (SELECT 1 FROM financial_app.documents WHERE id = v_allowed) THEN
    RAISE EXCEPTION 'rec_doc_delete_synthetic_supabase_result_invalid';
  END IF;

  v_result := financial_app.delete_document_registration(v_drive);
  IF v_result->>'documentId' <> v_drive::text
     OR v_result->>'sourceOriginalPreserved' <> 'true'
     OR v_result->>'bankSource' <> 'read_only'
     OR v_result->>'deleted' <> 'true'
     OR EXISTS (SELECT 1 FROM financial_app.documents WHERE id = v_drive) THEN
    RAISE EXCEPTION 'rec_doc_delete_synthetic_drive_result_invalid';
  END IF;

  SELECT count(*) INTO v_count FROM financial_app.audit_changes
  WHERE workspace_id = v_workspace
    AND entity_type = 'document'
    AND field_name = 'deleted'
    AND change_origin = 'user'
    AND new_value = 'true'::jsonb
    AND (
      (entity_id = v_allowed
        AND original_value->>'storageProvider' = 'supabase')
      OR (entity_id = v_drive
        AND original_value->>'storageProvider' = 'google_drive'
        AND original_value->>'sourceDriveFileId' = 'SYNTHETIC-FILE-603')
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'rec_doc_delete_synthetic_audit_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM financial_app.documents
    WHERE id = v_confirmed AND workspace_id = v_workspace
  ) THEN
    RAISE EXCEPTION 'rec_doc_delete_confirmed_disappeared';
  END IF;

  IF (SELECT count(*) FROM financial_app.transaction_source_records) <> v_source_count
     OR (SELECT count(*) FROM financial_app.transactions) <> v_transaction_count THEN
    RAISE EXCEPTION 'rec_doc_delete_bank_source_mutated';
  END IF;
END;
$synthetic_document_delete$;


ROLLBACK;

SELECT (
  md5(pg_get_functiondef('financial_app.delete_document_registration(uuid)'::regprocedure))
    = :'baseline_function_hash'
  AND has_function_privilege('anon',
    'financial_app.delete_document_registration(uuid)', 'EXECUTE')
    = :'baseline_anon_execute'
  AND has_function_privilege('authenticated',
    'financial_app.delete_document_registration(uuid)', 'EXECUTE')
    = :'baseline_auth_execute'
  AND has_function_privilege('service_role',
    'financial_app.delete_document_registration(uuid)', 'EXECUTE')
    = :'baseline_service_execute'
) AS rollback_verified
\gset
\if :rollback_verified
  \echo REC_DOC_DELETE_AUDIT|status=ok|isolated=true|schema_columns=checked|zero_row_insert=true|rollback=verified|live_writes=false
\else
  \echo REC_DOC_DELETE_AUDIT|status=failed|reason=rollback_changed_function_or_acl
  \quit 3
\endif
