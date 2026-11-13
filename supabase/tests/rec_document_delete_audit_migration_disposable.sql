\set ON_ERROR_STOP on
-- REC-DOC-DELETE-600: a real schema-migration rehearsal on the already
-- restored, disposable PostgreSQL 17 backup. The caller MUST restrict
-- PGHOST/port to loopback and MUST never pass a production credential.
-- Never call delete_document_registration on personal documents here.
-- The checked audit INSERT is deliberately zero-row; ROLLBACK also restores
-- the original definition and ACL, including on future post-DDL backups.

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
