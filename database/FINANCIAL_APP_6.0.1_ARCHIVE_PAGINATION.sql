begin;

-- Financial App 6.0.1 — Archivo: conteos coherentes y paginacion por estado.
-- Cambio estructural de lectura. No modifica documentos, movimientos, cuentas ni asociaciones.

create or replace function financial_app.archive_document_pending_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
  select
    coalesce(p_ocr_status,'') in ('pending','processing','needs_review','failed','error')
    or (
      p_document_date is not null
      and p_amount is not null
      and not exists(
        select 1
        from financial_app.transaction_documents td
        where td.document_id=p_document_id
      )
      and exists(
        select 1
        from financial_app.transactions t
        join financial_app.accounts a on a.id=t.account_id
        where t.source_missing=false
          and t.is_duplicate=false
          and coalesce(t.effective_date,t.source_date) between p_document_date-7 and p_document_date+7
          and abs(abs(t.source_amount)-abs(p_amount))<=greatest(3,abs(p_amount)*.15)
      )
    )
$$;

create or replace function financial_app.archive_document_state_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text,
  p_archived_at timestamptz
)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
  select case
    when p_archived_at is not null then 'archived'
    when financial_app.archive_document_pending_core(p_document_id,p_document_date,p_amount,p_ocr_status) then 'pending'
    else 'new'
  end
$$;

create or replace function financial_app.archive_document_payload_core(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
  select jsonb_build_object(
    'id',d.id,
    'fileName',d.file_name,
    'mimeType',d.mime_type,
    'storagePath',d.storage_path,
    'fileSize',d.file_size,
    'contentHash',d.content_hash,
    'documentType',d.document_type,
    'documentDate',d.document_date,
    'amount',d.amount,
    'merchant',d.merchant,
    'ocrStatus',d.ocr_status,
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
          'counterparty',coalesce(t.counterparty_override,t.source_counterparty)
        )
        order by coalesce(t.effective_date,t.source_date) desc
      )
      from financial_app.transaction_documents td
      join financial_app.transactions t on t.id=td.transaction_id
      where td.document_id=d.id
    ),'[]'::jsonb),
    'suggestions',case
      when d.document_date is null or d.amount is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(x.obj order by x.score desc)
        from (
          select
            jsonb_build_object(
              'sourceId',t.source_id,
              'date',coalesce(t.effective_date,t.source_date),
              'amount',t.source_amount,
              'concept',coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept),
              'counterparty',coalesce(t.counterparty_override,t.source_counterparty),
              'score',round((
                100
                - abs(coalesce(t.effective_date,t.source_date)-d.document_date)*5
                - greatest(0,abs(abs(t.source_amount)-abs(d.amount))/greatest(abs(d.amount),1)*50)
              )::numeric,1)
            ) as obj,
            (
              100
              - abs(coalesce(t.effective_date,t.source_date)-d.document_date)*5
              - greatest(0,abs(abs(t.source_amount)-abs(d.amount))/greatest(abs(d.amount),1)*50)
            ) as score
          from financial_app.transactions t
          join financial_app.accounts a on a.id=t.account_id
          where t.source_missing=false
            and t.is_duplicate=false
            and coalesce(t.effective_date,t.source_date) between d.document_date-7 and d.document_date+7
            and abs(abs(t.source_amount)-abs(d.amount))<=greatest(3,abs(d.amount)*.15)
          order by score desc
          limit 5
        ) x
      ),'[]'::jsonb)
    end
  )
  from financial_app.documents d
  where d.id=p_document_id
$$;

create or replace function financial_app.archive_overview_core(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_query text;
  v_docs jsonb:='[]'::jsonb;
  v_total int:=0;
  v_processed int:=0;
  v_linked int:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  p_limit:=greatest(1,least(coalesce(p_limit,100),200));
  p_offset:=greatest(0,coalesce(p_offset,0));
  v_query:=nullif(trim(coalesce(p_search,'')),'');

  select
    count(*),
    count(*) filter(where d.ocr_status in('complete','manual','not_required')),
    count(*) filter(where exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id))
  into v_total,v_processed,v_linked
  from financial_app.documents d
  where (p_include_archived or d.archived_at is null)
    and (
      v_query is null
      or d.file_name ilike '%'||v_query||'%'
      or coalesce(d.merchant,'') ilike '%'||v_query||'%'
      or coalesce(d.ocr_text,'') ilike '%'||v_query||'%'
      or coalesce(d.notes,'') ilike '%'||v_query||'%'
    );

  with page as (
    select d.id,coalesce(d.document_date,d.created_at::date) as sort_date,d.created_at
    from financial_app.documents d
    where (p_include_archived or d.archived_at is null)
      and (
        v_query is null
        or d.file_name ilike '%'||v_query||'%'
        or coalesce(d.merchant,'') ilike '%'||v_query||'%'
        or coalesce(d.ocr_text,'') ilike '%'||v_query||'%'
        or coalesce(d.notes,'') ilike '%'||v_query||'%'
      )
    order by coalesce(d.document_date,d.created_at::date) desc,d.created_at desc
    limit p_limit offset p_offset
  )
  select coalesce(
    jsonb_agg(financial_app.archive_document_payload_core(page.id) order by page.sort_date desc,page.created_at desc),
    '[]'::jsonb
  )
  into v_docs
  from page;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'bucket','financial-app-documents',
    'private',true,
    'maxFileSize',20971520,
    'allowedMimeTypes',jsonb_build_array('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'),
    'total',v_total,
    'processed',v_processed,
    'linked',v_linked,
    'documents',v_docs
  );
end
$$;

create or replace function financial_app.archive_lifecycle_overview_core(
  p_state text default 'new',
  p_search text default null,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_state text;
  v_query text;
  v_docs jsonb:='[]'::jsonb;
  v_total int:=0;
  v_processed int:=0;
  v_linked int:=0;
  v_new int:=0;
  v_pending int:=0;
  v_archived int:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_state:=lower(trim(coalesce(p_state,'new')));
  if v_state not in ('new','pending','archived') then
    raise exception 'invalid archive state' using errcode='22023';
  end if;

  p_limit:=greatest(1,least(coalesce(p_limit,40),100));
  p_offset:=greatest(0,coalesce(p_offset,0));
  v_query:=nullif(trim(coalesce(p_search,'')),'');

  with classified as (
    select
      d.id,
      financial_app.archive_document_state_core(d.id,d.document_date,d.amount,d.ocr_status,d.archived_at) as state
    from financial_app.documents d
  )
  select
    count(*) filter(where state='new'),
    count(*) filter(where state='pending'),
    count(*) filter(where state='archived')
  into v_new,v_pending,v_archived
  from classified;

  with classified as (
    select
      d.id,
      d.ocr_status,
      d.file_name,
      d.merchant,
      d.ocr_text,
      d.notes,
      financial_app.archive_document_state_core(d.id,d.document_date,d.amount,d.ocr_status,d.archived_at) as state
    from financial_app.documents d
  ), filtered as (
    select *
    from classified
    where state=v_state
      and (
        v_query is null
        or file_name ilike '%'||v_query||'%'
        or coalesce(merchant,'') ilike '%'||v_query||'%'
        or coalesce(ocr_text,'') ilike '%'||v_query||'%'
        or coalesce(notes,'') ilike '%'||v_query||'%'
      )
  )
  select
    count(*),
    count(*) filter(where ocr_status in('complete','manual','not_required')),
    count(*) filter(where exists(select 1 from financial_app.transaction_documents td where td.document_id=filtered.id))
  into v_total,v_processed,v_linked
  from filtered;

  with classified as (
    select
      d.id,
      d.file_name,
      d.merchant,
      d.ocr_text,
      d.notes,
      coalesce(d.document_date,d.created_at::date) as sort_date,
      d.created_at,
      financial_app.archive_document_state_core(d.id,d.document_date,d.amount,d.ocr_status,d.archived_at) as state
    from financial_app.documents d
  ), page as (
    select id,sort_date,created_at
    from classified
    where state=v_state
      and (
        v_query is null
        or file_name ilike '%'||v_query||'%'
        or coalesce(merchant,'') ilike '%'||v_query||'%'
        or coalesce(ocr_text,'') ilike '%'||v_query||'%'
        or coalesce(notes,'') ilike '%'||v_query||'%'
      )
    order by sort_date desc,created_at desc
    limit p_limit offset p_offset
  )
  select coalesce(
    jsonb_agg(financial_app.archive_document_payload_core(page.id) order by page.sort_date desc,page.created_at desc),
    '[]'::jsonb
  )
  into v_docs
  from page;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'bucket','financial-app-documents',
    'private',true,
    'maxFileSize',20971520,
    'allowedMimeTypes',jsonb_build_array('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'),
    'state',v_state,
    'counts',jsonb_build_object('new',v_new,'pending',v_pending,'archived',v_archived),
    'total',v_total,
    'processed',v_processed,
    'linked',v_linked,
    'documents',v_docs
  );
end
$$;

create or replace function public.financial_app_archive_lifecycle_overview(
  p_state text default 'new',
  p_search text default null,
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app','auth'
as $$
  select financial_app.archive_lifecycle_overview_core(p_state,p_search,p_limit,p_offset)
         || jsonb_build_object('version',financial_app.current_app_version())
$$;

revoke all on function financial_app.archive_document_pending_core(uuid,date,numeric,text) from public;
revoke all on function financial_app.archive_document_state_core(uuid,date,numeric,text,timestamptz) from public;
revoke all on function financial_app.archive_document_payload_core(uuid) from public;
revoke all on function financial_app.archive_lifecycle_overview_core(text,text,integer,integer) from public;
revoke all on function public.financial_app_archive_lifecycle_overview(text,text,integer,integer) from public;
grant execute on function public.financial_app_archive_lifecycle_overview(text,text,integer,integer) to authenticated;

commit;
