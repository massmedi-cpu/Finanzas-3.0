-- Financial App 9.0.0 — durabilidad del almacenamiento documental.
-- Borrados, sustituciones de duplicados y huérfanos usan una única cola persistente.

begin;

create table if not exists financial_app.document_deletion_tombstones (
  id bigint generated always as identity primary key,
  document_id uuid not null unique,
  document_snapshot jsonb not null,
  deleted_by text not null,
  deleted_at timestamptz not null default now(),
  storage_provider text,
  bucket text,
  storage_path text,
  cleanup_status text not null default 'not_required'
    check(cleanup_status in ('not_required','pending','complete','failed')),
  cleanup_attempts integer not null default 0 check(cleanup_attempts>=0),
  cleanup_last_error text,
  cleanup_last_attempt_at timestamptz,
  cleanup_completed_at timestamptz
);

create table if not exists financial_app.document_storage_cleanup_queue (
  id bigint generated always as identity primary key,
  document_id uuid,
  bucket text not null,
  storage_path text not null,
  reason text not null check(reason in ('document_delete','duplicate_replaced','orphan_reconciliation')),
  created_by text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','complete','failed')),
  attempts integer not null default 0 check(attempts>=0),
  last_error text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  unique(bucket,storage_path)
);

create index if not exists idx_document_deletion_tombstones_cleanup
  on financial_app.document_deletion_tombstones(cleanup_status,deleted_at)
  where cleanup_status in ('pending','failed');
create index if not exists idx_document_storage_cleanup_queue_pending
  on financial_app.document_storage_cleanup_queue(status,created_at)
  where status in ('pending','failed');

alter table financial_app.document_deletion_tombstones enable row level security;
alter table financial_app.document_storage_cleanup_queue enable row level security;
revoke all on table financial_app.document_deletion_tombstones from public,anon,authenticated;
revoke all on table financial_app.document_storage_cleanup_queue from public,anon,authenticated;

create or replace function financial_app.archive_delete_core(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_document financial_app.documents%rowtype;
  v_cleanup_status text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select * into v_document from financial_app.documents where id=p_id for update;
  if not found then raise exception 'document not found'; end if;

  v_cleanup_status:=case
    when v_document.storage_provider='supabase_storage' and nullif(v_document.storage_path,'') is not null
      then 'pending' else 'not_required' end;

  insert into financial_app.document_deletion_tombstones(
    document_id,document_snapshot,deleted_by,storage_provider,bucket,storage_path,
    cleanup_status,cleanup_completed_at
  ) values(
    v_document.id,to_jsonb(v_document),v_email,v_document.storage_provider,
    case when v_document.storage_provider='supabase_storage' then 'financial-app-documents' else null end,
    v_document.storage_path,v_cleanup_status,
    case when v_cleanup_status='not_required' then now() else null end
  )
  on conflict(document_id) do update set
    document_snapshot=excluded.document_snapshot,
    deleted_by=excluded.deleted_by,
    deleted_at=now(),
    storage_provider=excluded.storage_provider,
    bucket=excluded.bucket,
    storage_path=excluded.storage_path,
    cleanup_status=excluded.cleanup_status,
    cleanup_attempts=0,
    cleanup_last_error=null,
    cleanup_last_attempt_at=null,
    cleanup_completed_at=excluded.cleanup_completed_at;

  if v_cleanup_status='pending' then
    insert into financial_app.document_storage_cleanup_queue(
      document_id,bucket,storage_path,reason,created_by
    ) values(
      v_document.id,'financial-app-documents',v_document.storage_path,'document_delete',v_email
    )
    on conflict(bucket,storage_path) do update set
      document_id=excluded.document_id,
      reason=excluded.reason,
      created_by=excluded.created_by,
      created_at=now(),status='pending',attempts=0,last_error=null,last_attempt_at=null,completed_at=null;
  end if;

  delete from financial_app.documents where id=p_id;
  return true;
end
$function$;

create or replace function financial_app.archive_reuse_duplicate_core(
  p_id uuid,p_content_hash text,p_file_name text,p_mime_type text,
  p_storage_path text,p_file_size bigint
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth','storage'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_uid uuid:=auth.uid();
  v_owner text;
  v_before jsonb;
  v_previous_provider text;
  v_previous_path text;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_uid is null then raise exception 'missing user'; end if;
  if nullif(trim(coalesce(p_content_hash,'')),'') is null then raise exception 'content hash required'; end if;
  if nullif(trim(coalesce(p_storage_path,'')),'') is null then raise exception 'file metadata required'; end if;
  if p_storage_path not like v_uid::text||'/%' then raise exception 'invalid storage path'; end if;
  if p_mime_type not in('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif') then raise exception 'unsupported file type'; end if;
  if coalesce(p_file_size,0)<=0 or p_file_size>20971520 then raise exception 'invalid file size'; end if;

  select owner_id into v_owner
  from storage.objects
  where bucket_id='financial-app-documents' and name=p_storage_path
  limit 1;
  if v_owner is null or v_owner<>v_uid::text then raise exception 'stored object not found'; end if;

  select to_jsonb(d),d.storage_provider,d.storage_path
  into v_before,v_previous_provider,v_previous_path
  from financial_app.documents d
  where d.id=p_id and d.content_hash=lower(trim(p_content_hash))
  for update;
  if v_before is null then raise exception 'document_not_found'; end if;

  if v_previous_provider='supabase_storage'
    and nullif(v_previous_path,'') is not null
    and v_previous_path<>p_storage_path then
    insert into financial_app.document_storage_cleanup_queue(
      document_id,bucket,storage_path,reason,created_by
    ) values(
      p_id,'financial-app-documents',v_previous_path,'duplicate_replaced',v_email
    )
    on conflict(bucket,storage_path) do update set
      document_id=excluded.document_id,
      reason=excluded.reason,
      created_by=excluded.created_by,
      created_at=now(),status='pending',attempts=0,last_error=null,last_attempt_at=null,completed_at=null;
  end if;

  update financial_app.documents
  set file_name=coalesce(nullif(trim(p_file_name),''),file_name),
      mime_type=p_mime_type,
      storage_provider='supabase_storage',storage_url=null,
      storage_path=p_storage_path,file_size=p_file_size,
      original_preserved=true,updated_at=now()
  where id=p_id;

  insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
  select p_id,'reuse_duplicate_original',v_before,to_jsonb(d),v_email
  from financial_app.documents d where d.id=p_id;
  return true;
end
$function$;

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
  where q.status in ('pending','failed')
  order by q.created_at,q.id
  limit greatest(1,least(coalesce(p_limit,20),100));
end
$function$;

create or replace function financial_app.document_storage_cleanup_mark_core(
  p_cleanup_id bigint,p_success boolean,p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_document_id uuid;
  v_reason text;
  v_status text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_status:=case when coalesce(p_success,false) then 'complete' else 'failed' end;

  update financial_app.document_storage_cleanup_queue
  set status=v_status,
      attempts=attempts+1,
      last_error=case when v_status='complete' then null else left(nullif(coalesce(p_error,''),''),1000) end,
      last_attempt_at=now(),
      completed_at=case when v_status='complete' then now() else null end
  where id=p_cleanup_id and status in ('pending','failed')
  returning document_id,reason into v_document_id,v_reason;
  if not found then return false; end if;

  if v_reason='document_delete' and v_document_id is not null then
    update financial_app.document_deletion_tombstones
    set cleanup_status=v_status,
        cleanup_attempts=cleanup_attempts+1,
        cleanup_last_error=case when v_status='complete' then null else left(nullif(coalesce(p_error,''),''),1000) end,
        cleanup_last_attempt_at=now(),
        cleanup_completed_at=case when v_status='complete' then now() else null end
    where document_id=v_document_id;
  end if;
  return true;
end
$function$;

create or replace function financial_app.document_storage_cleanup_count_core()
returns integer
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text;v_count integer;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select count(*)::integer into v_count
  from financial_app.document_storage_cleanup_queue
  where status in ('pending','failed');
  return coalesce(v_count,0);
end
$function$;

create or replace function financial_app.document_lifecycle_health_core()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_active integer:=0;
  v_pending integer:=0;
  v_archived integer:=0;
  v_cleanup integer:=0;
  v_missing_original integer:=0;
  v_orphan_storage integer:=0;
  v_duplicate_links integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select count(*) filter(where d.archived_at is null)::integer,
    count(*) filter(where d.archived_at is null and financial_app.archive_document_pending_core(d.id,d.document_date,d.amount,d.ocr_status))::integer,
    count(*) filter(where d.archived_at is not null)::integer
  into v_active,v_pending,v_archived from financial_app.documents d;

  select count(*)::integer into v_cleanup
  from financial_app.document_storage_cleanup_queue where status in ('pending','failed');

  select count(*)::integer into v_missing_original
  from financial_app.documents d
  where d.storage_provider='supabase_storage' and d.storage_path is not null
    and not exists(select 1 from storage.objects o where o.bucket_id='financial-app-documents' and o.name=d.storage_path);

  select count(*)::integer into v_orphan_storage
  from storage.objects o
  where o.bucket_id='financial-app-documents'
    and not exists(select 1 from financial_app.documents d where d.storage_provider='supabase_storage' and d.storage_path=o.name)
    and not exists(select 1 from financial_app.document_storage_cleanup_queue q where q.bucket='financial-app-documents' and q.storage_path=o.name and q.status in ('pending','failed'));

  select count(*)::integer into v_duplicate_links
  from (
    select td.document_id,td.transaction_id
    from financial_app.transaction_documents td
    group by td.document_id,td.transaction_id having count(*)>1
  )x;

  return jsonb_build_object(
    'ok',v_cleanup=0 and v_missing_original=0 and v_orphan_storage=0 and v_duplicate_links=0,
    'active',v_active,'pending',v_pending,'archived',v_archived,
    'cleanupPending',v_cleanup,'missingOriginals',v_missing_original,
    'orphanStorageObjects',v_orphan_storage,'duplicateLinks',v_duplicate_links
  );
end
$function$;

create or replace function public.financial_app_document_storage_cleanup_reconcile()
returns integer language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$ select financial_app.document_storage_cleanup_reconcile_core() $function$;

create or replace function public.financial_app_document_storage_cleanup_pending(p_limit integer default 20)
returns table(cleanup_id bigint,document_id uuid,bucket text,storage_path text,attempts integer)
language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$ select * from financial_app.document_storage_cleanup_pending_core(p_limit) $function$;

create or replace function public.financial_app_document_storage_cleanup_mark(
  p_cleanup_id bigint,p_success boolean,p_error text default null
)
returns boolean language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$ select financial_app.document_storage_cleanup_mark_core(p_cleanup_id,p_success,p_error) $function$;

create or replace function public.financial_app_document_storage_cleanup_count()
returns integer language sql stable
set search_path to 'pg_catalog','financial_app','auth'
as $function$ select financial_app.document_storage_cleanup_count_core() $function$;

create or replace function public.financial_app_document_lifecycle_health()
returns jsonb language sql stable
set search_path to 'pg_catalog','financial_app','auth'
as $function$ select financial_app.document_lifecycle_health_core() $function$;

revoke all on function financial_app.document_storage_cleanup_reconcile_core() from public,anon,authenticated,service_role;
revoke all on function financial_app.document_storage_cleanup_pending_core(integer) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_storage_cleanup_mark_core(bigint,boolean,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_storage_cleanup_count_core() from public,anon,authenticated,service_role;
revoke all on function financial_app.document_lifecycle_health_core() from public,anon,authenticated,service_role;
revoke all on function public.financial_app_document_storage_cleanup_reconcile() from public,anon;
revoke all on function public.financial_app_document_storage_cleanup_pending(integer) from public,anon;
revoke all on function public.financial_app_document_storage_cleanup_mark(bigint,boolean,text) from public,anon;
revoke all on function public.financial_app_document_storage_cleanup_count() from public,anon;
revoke all on function public.financial_app_document_lifecycle_health() from public,anon;
grant execute on function public.financial_app_document_storage_cleanup_reconcile() to authenticated,service_role;
grant execute on function public.financial_app_document_storage_cleanup_pending(integer) to authenticated,service_role;
grant execute on function public.financial_app_document_storage_cleanup_mark(bigint,boolean,text) to authenticated,service_role;
grant execute on function public.financial_app_document_storage_cleanup_count() to authenticated,service_role;
grant execute on function public.financial_app_document_lifecycle_health() to authenticated,service_role;

commit;
