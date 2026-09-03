-- Financial App 9.0.0
-- Restore the archive payload contract required by OCR recovery.
-- The UI and recovery policy already consume storageProvider/storageUrl; the
-- database payload must expose those fields from the canonical documents row.

create or replace function financial_app.archive_document_payload_core(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'financial_app', 'auth'
as $function$
  select jsonb_build_object(
    'id',d.id,
    'fileName',d.file_name,
    'mimeType',d.mime_type,
    'storageProvider',d.storage_provider,
    'storageUrl',d.storage_url,
    'storagePath',d.storage_path,
    'fileSize',d.file_size,
    'contentHash',d.content_hash,
    'documentType',d.document_type,
    'documentDate',d.document_date,
    'amount',d.amount,
    'merchant',d.merchant,
    'ocrStatus',d.ocr_status,
    'lifecycleState',financial_app.archive_document_state_core(
      d.id,d.document_date,d.amount,d.ocr_status,d.archived_at
    ),
    'pendingReasons',to_jsonb(financial_app.archive_document_pending_reasons_core(
      d.id,d.document_date,d.amount,d.ocr_status
    )),
    'hasOcrText',d.ocr_text is not null,
    'hasReconstruction',d.digital_reconstruction is not null,
    'notes',d.notes,
    'archivedAt',d.archived_at,
    'createdAt',d.created_at,
    'updatedAt',d.updated_at,
    'links',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceId',t.source_id,
          'date',coalesce(t.effective_date,t.source_date),
          'amount',t.source_amount,
          'concept',coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept),
          'counterparty',coalesce(t.counterparty_override,t.source_counterparty),
          'associationOrigin',td.association_origin,
          'confidence',td.confidence
        )
        order by coalesce(t.effective_date,t.source_date) desc
      )
      from financial_app.transaction_documents td
      join financial_app.transactions t on t.id=td.transaction_id
      where td.document_id=d.id
    ),'[]'::jsonb),
    'suggestions',financial_app.document_match_candidates_json_core(d.id,5)
  )
  from financial_app.documents d
  where d.id=p_document_id
$function$;
