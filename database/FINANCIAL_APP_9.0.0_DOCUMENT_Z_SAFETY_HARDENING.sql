-- Financial App 9.0.0 — endurecimiento final del ciclo documental.
-- Evita carreras entre upload/registro, limita reintentos de limpieza y hace el gate sensible a enlaces ya resueltos.

begin;

-- Un documento ya enlazado no debe quedar bloqueado por candidatos residuales.
-- El OCR con error/revisión sí sigue siendo un motivo de pendiente para preservar integridad documental.
create or replace function financial_app.archive_document_pending_reasons_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text
)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  with state as (
    select exists(
      select 1
      from financial_app.transaction_documents td
      where td.document_id=p_document_id
    ) as linked
  )
  select array_remove(array[
    case lower(coalesce(p_ocr_status,''))
      when 'pending' then 'ocr_pending'
      when 'processing' then 'ocr_processing'
      when 'needs_review' then 'ocr_needs_review'
      when 'failed' then 'ocr_failed'
      when 'error' then 'ocr_error'
      else null
    end,
    case
      when not state.linked and financial_app.document_has_match_candidate_core(p_document_id)
        then 'movement_match_pending'
      else null
    end
  ]::text[],null)
  from state
$function$;

-- Nunca reconciliar como huérfano un objeto recién subido: el alta del registro documental
-- ocurre después del upload y existe una ventana legítima en la que Storage ya tiene el objeto.
create or replace function financial_app.document_storage_cleanup_reconcile_core()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth','storage'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_uid uuid:=auth.uid();
  v_inserted integer:=0;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_uid is null then raise exception 'missing user' using errcode='42501'; end if;

  insert into financial_app.document_storage_cleanup_queue(
    document_id,bucket,storage_path,reason,created_by
  )
  select null,'financial-app-documents',o.name,'orphan_reconciliation',v_email
  from storage.objects o
  where o.bucket_id='financial-app-documents'
    and o.owner_id=v_uid::text
    and o.created_at<=now()-interval '15 minutes'
    and not exists(
      select 1 from financial_app.documents d
      where d.storage_provider='supabase_storage' and d.storage_path=o.name
    )
    and not exists(
      select 1 from financial_app.document_storage_cleanup_queue q
      where q.bucket='financial-app-documents' and q.storage_path=o.name
    )
  on conflict(bucket,storage_path) do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end
$function$;

-- Los fallos de Storage no se martillean en cada petición. Se reintentan hasta 5 veces
-- y como máximo una vez cada 10 minutos; los fallos agotados siguen visibles en health.
create or replace function financial_app.document_storage_cleanup_pending_core(p_limit integer default 20)
returns table(cleanup_id bigint,document_id uuid,bucket text,storage_path text,attempts integer)
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  return query
  select q.id,q.document_id,q.bucket,q.storage_path,q.attempts
  from financial_app.document_storage_cleanup_queue q
  where q.status='pending'
     or (
       q.status='failed'
       and q.attempts<5
       and (q.last_attempt_at is null or q.last_attempt_at<=now()-interval '10 minutes')
     )
  order by q.created_at,q.id
  limit greatest(1,least(coalesce(p_limit,20),100));
end
$function$;

-- Health es observación pura. Solo cuenta huérfanos maduros del usuario autenticado;
-- una subida aún dentro de la ventana de registro no degrada el release gate.
create or replace function financial_app.document_lifecycle_health_core()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth','storage'
as $function$
declare
  v_email text;
  v_uid uuid;
  v_active integer:=0;
  v_pending integer:=0;
  v_archived integer:=0;
  v_cleanup integer:=0;
  v_missing_original integer:=0;
  v_orphan_storage integer:=0;
  v_duplicate_links integer:=0;
begin
  v_email:=financial_app.authorized_email();
  v_uid:=auth.uid();
  if v_email is null or v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;

  select count(*) filter(where d.archived_at is null)::integer,
    count(*) filter(
      where d.archived_at is null
        and financial_app.archive_document_pending_core(d.id,d.document_date,d.amount,d.ocr_status)
    )::integer,
    count(*) filter(where d.archived_at is not null)::integer
  into v_active,v_pending,v_archived
  from financial_app.documents d;

  select count(*)::integer into v_cleanup
  from financial_app.document_storage_cleanup_queue
  where status in ('pending','failed');

  select count(*)::integer into v_missing_original
  from financial_app.documents d
  where d.storage_provider='supabase_storage'
    and d.storage_path is not null
    and not exists(
      select 1 from storage.objects o
      where o.bucket_id='financial-app-documents' and o.name=d.storage_path
    );

  select count(*)::integer into v_orphan_storage
  from storage.objects o
  where o.bucket_id='financial-app-documents'
    and o.owner_id=v_uid::text
    and o.created_at<=now()-interval '15 minutes'
    and not exists(
      select 1 from financial_app.documents d
      where d.storage_provider='supabase_storage' and d.storage_path=o.name
    )
    and not exists(
      select 1 from financial_app.document_storage_cleanup_queue q
      where q.bucket='financial-app-documents'
        and q.storage_path=o.name
        and q.status in ('pending','failed')
    );

  select count(*)::integer into v_duplicate_links
  from (
    select td.document_id,td.transaction_id
    from financial_app.transaction_documents td
    group by td.document_id,td.transaction_id
    having count(*)>1
  )x;

  return jsonb_build_object(
    'ok',v_cleanup=0 and v_missing_original=0 and v_orphan_storage=0 and v_duplicate_links=0,
    'active',v_active,
    'pending',v_pending,
    'archived',v_archived,
    'cleanupPending',v_cleanup,
    'missingOriginals',v_missing_original,
    'orphanStorageObjects',v_orphan_storage,
    'duplicateLinks',v_duplicate_links,
    'orphanGraceMinutes',15,
    'cleanupRetryLimit',5,
    'cleanupRetryBackoffMinutes',10
  );
end
$function$;

revoke all on function financial_app.archive_document_pending_reasons_core(uuid,date,numeric,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_storage_cleanup_reconcile_core() from public,anon,authenticated,service_role;
revoke all on function financial_app.document_storage_cleanup_pending_core(integer) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_lifecycle_health_core() from public,anon,authenticated,service_role;

commit;
