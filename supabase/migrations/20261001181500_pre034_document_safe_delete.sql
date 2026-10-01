-- Financial App · PRE-034 · Axioma §50
-- Eliminación documental conservadora: sólo documentos no confirmados y sin asociaciones.
-- Google Drive permanece como fuente externa de solo lectura; nunca se borra el archivo original.

create or replace function financial_app.document_delete_preflight(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_association_count integer := 0;
  v_ocr_run_count integer := 0;
  v_review_count integer := 0;
  v_can_delete boolean;
  v_reason text;
begin
  select * into v_document
  from financial_app.documents
  where id = p_id;
  if not found then raise exception 'document_not_found'; end if;
  perform financial_app.assert_workspace_reference(v_workspace_id, v_document.workspace_id);

  select count(*)::integer into v_association_count
  from financial_app.document_transaction_associations
  where workspace_id = v_workspace_id and document_id = p_id;

  select count(*)::integer into v_ocr_run_count
  from financial_app.document_ocr_runs
  where workspace_id = v_workspace_id and document_id = p_id;

  select count(*)::integer into v_review_count
  from financial_app.document_ocr_reviews
  where workspace_id = v_workspace_id and document_id = p_id;

  v_can_delete := v_document.status in ('imported','pending_review') and v_association_count = 0 and v_review_count = 0;
  v_reason := case
    when v_document.status = 'confirmed' then 'document_delete_confirmed_forbidden'
    when v_document.status = 'archived' then 'document_delete_archived_forbidden'
    when v_association_count > 0 then 'document_delete_associated_forbidden'
    when v_review_count > 0 then 'document_delete_reviewed_forbidden'
    else null
  end;

  return jsonb_build_object(
    'contractVersion', 1,
    'documentId', p_id,
    'canDelete', v_can_delete,
    'reason', v_reason,
    'status', v_document.status,
    'associationCount', v_association_count,
    'ocrRunCount', v_ocr_run_count,
    'reviewCount', v_review_count,
    'storageProvider', v_document.storage_provider,
    'sourceOriginalWillBePreserved', v_document.storage_provider = 'google_drive',
    'bankSource', 'read_only'
  );
end;
$$;

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
    original_value, new_value, change_origin, actor_type
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
    'true'::jsonb, 'user', 'user'
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
