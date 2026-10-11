-- Financial App · AP-1 · immutable private original identity
-- Applied to candidate DISPOSABLE PostgreSQL before any production rollout.
-- This trigger never changes an existing document's data.
CREATE OR REPLACE FUNCTION financial_app.prevent_private_original_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- No document may silently change provider/storage key. Associations,
  -- metadata and audit history still point to the original source.
  IF NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key THEN
    RAISE EXCEPTION 'document_original_storage_identity_immutable'
      USING ERRCODE = '23514';
  END IF;

  -- The user's classification, notes, status and reviewed OCR remain
  -- editable. The uploaded private BYTES, however, may not be silently
  -- re-labelled by a second finalize or legacy register_document UPSERT.
  IF OLD.storage_provider = 'supabase'
     AND (NEW.original_file_name IS DISTINCT FROM OLD.original_file_name
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.source_drive_file_id IS DISTINCT FROM OLD.source_drive_file_id)
  THEN
    RAISE EXCEPTION 'document_private_original_immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION financial_app.prevent_private_original_rewrite()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_private_original_rewrite_guard
  ON financial_app.documents;

CREATE TRIGGER documents_private_original_rewrite_guard
  BEFORE UPDATE ON financial_app.documents
  FOR EACH ROW
  EXECUTE FUNCTION financial_app.prevent_private_original_rewrite();

COMMENT ON FUNCTION financial_app.prevent_private_original_rewrite()
IS 'AP-1: original private bytes and Storage identity cannot be overwritten by retried registrations; editable document metadata remains editable.';
