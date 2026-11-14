-- REC-DOC-DELETE-255: forward-only repair after the live schema audit on
-- 12/11/2026 found audit_changes has no actor_type column.
-- Recompile the SAME scoped, conservative delete function with a valid audit
-- INSERT; never change bank source, permissions, or any existing document.
-- The original migration stays immutable in migration history.
create or replace function financial_app.delete_document_registration(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_preflight jsonb;
begin
  select * into v_document
  from financial_app.documents
  where id = p_id
  for update;
  if not found then raise exception 'document_not_found'; end if;
  perform financial_app.assert_workspace_reference(v_workspace_id, v_document.workspace_id);

  v_preflight := financial_app.document_delete_preflight(p_id);
  if coalesce((v_preflight->>'canDelete')::boolean, false) <> true then
    raise exception '%', coalesce(v_preflight->>'reason', 'document_delete_forbidden');
  end if;

  insert into financial_app.audit_changes(
    workspace_id, entity_type, entity_id, field_name,
    original_value, new_value, change_origin
  ) values (
    v_workspace_id, 'document', p_id, 'deleted',
    jsonb_build_object(
      'type', v_document.type,
      'status', v_document.status,
      'storageProvider', v_document.storage_provider,
      'storageKey', v_document.storage_key,
      'sourceDriveFileId', v_document.source_drive_file_id,
      'originalFileName', v_document.original_file_name
    ),
    'true'::jsonb, 'user'
  );

  delete from financial_app.documents
  where id = p_id and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'contractVersion', 1,
    'deleted', true,
    'documentId', p_id,
    'storageProvider', v_document.storage_provider,
    'storageKey', v_document.storage_key,
    'sourceDriveFileId', v_document.source_drive_file_id,
    'sourceOriginalPreserved', v_document.storage_provider = 'google_drive',
    'bankSource', 'read_only'
  );
end;
$$;

revoke all on function financial_app.document_delete_preflight(uuid) from public;
revoke all on function financial_app.delete_document_registration(uuid) from public;
grant execute on function financial_app.document_delete_preflight(uuid) to service_role;
grant execute on function financial_app.delete_document_registration(uuid) to service_role;
