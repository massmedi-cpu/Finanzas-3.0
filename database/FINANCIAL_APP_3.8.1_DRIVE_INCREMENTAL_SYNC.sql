begin;

-- Financial App 3.8.1 · sincronización incremental de documentos Google Drive.
-- El token de Drive solo avanza dentro de la misma transacción que aplica altas,
-- cambios, reactivaciones y eliminaciones/movimientos fuera de Compras_y_facturas.

create table if not exists financial_app.drive_sync_state(
  id text primary key,
  change_token text,
  initialized_at timestamptz,
  updated_at timestamptz not null default now(),
  last_mode text,
  last_seen_files integer not null default 0,
  constraint drive_sync_state_id_chk check(id='documents'),
  constraint drive_sync_state_mode_chk check(last_mode is null or last_mode in('full','incremental')),
  constraint drive_sync_state_seen_chk check(last_seen_files>=0)
);

alter table financial_app.drive_sync_state enable row level security;
revoke all on table financial_app.drive_sync_state from public,anon,authenticated;

create or replace function financial_app.drive_sync_state_core()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_state financial_app.drive_sync_state%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_state from financial_app.drive_sync_state where id='documents';
  if not found then
    return jsonb_build_object('changeToken',null,'initializedAt',null,'updatedAt',null,'lastMode',null,'lastSeenFiles',0);
  end if;
  return jsonb_build_object('changeToken',v_state.change_token,'initializedAt',v_state.initialized_at,'updatedAt',v_state.updated_at,'lastMode',v_state.last_mode,'lastSeenFiles',v_state.last_seen_files);
end
$$;

revoke all on function financial_app.drive_sync_state_core() from public,anon,authenticated;
grant execute on function financial_app.drive_sync_state_core() to service_role;

create or replace function public.financial_app_drive_sync_state()
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.drive_sync_state_core() $$;

revoke all on function public.financial_app_drive_sync_state() from public,anon,authenticated;
grant execute on function public.financial_app_drive_sync_state() to service_role;

create or replace function financial_app.apply_drive_document_delta_core(
  p_files jsonb,
  p_removed_ids text[],
  p_next_token text,
  p_full_scan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_import jsonb;
  v_archived integer:=0;
  v_reactivated integer:=0;
  v_removed text[];
  v_seen integer:=0;
  v_changed boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'invalid_drive_files'; end if;
  if jsonb_array_length(p_files)>2000 then raise exception 'drive_file_limit_exceeded'; end if;
  if p_next_token is not null and (length(p_next_token)=0 or length(p_next_token)>4096) then raise exception 'invalid_drive_change_token'; end if;

  select coalesce(array_agg(distinct nullif(btrim(x),'')) filter(where nullif(btrim(x),'') is not null),array[]::text[])
    into v_removed
  from unnest(coalesce(p_removed_ids,array[]::text[])) x;
  if cardinality(v_removed)>2000 then raise exception 'drive_removed_limit_exceeded'; end if;

  v_import:=financial_app.import_drive_documents_core(p_files);
  v_seen:=coalesce((v_import->>'valid')::int,(v_import->>'scanned')::int,0);

  with incoming as (
    select distinct nullif(btrim(value->>'id'),'') id
    from jsonb_array_elements(p_files)
    where nullif(btrim(value->>'id'),'') is not null
  )
  update financial_app.documents d
     set archived_at=null,updated_at=now()
   where d.storage_provider='google_drive'
     and d.archived_at is not null
     and exists(select 1 from incoming i where i.id=d.storage_path);
  get diagnostics v_reactivated=row_count;

  update financial_app.documents d
     set archived_at=coalesce(d.archived_at,now()),updated_at=now()
   where d.storage_provider='google_drive'
     and d.archived_at is null
     and (coalesce(d.ocr_data->>'importedBy','')='financial-app-sync' or d.uploaded_by='financial-app-sync')
     and (
       d.storage_path=any(v_removed)
       or (
         coalesce(p_full_scan,false)
         and not exists(
           select 1 from jsonb_array_elements(p_files) e
           where nullif(btrim(e->>'id'),'')=d.storage_path
         )
       )
     );
  get diagnostics v_archived=row_count;

  insert into financial_app.drive_sync_state(id,change_token,initialized_at,updated_at,last_mode,last_seen_files)
  values('documents',p_next_token,now(),now(),case when coalesce(p_full_scan,false) then 'full' else 'incremental' end,v_seen)
  on conflict(id) do update
    set change_token=coalesce(excluded.change_token,financial_app.drive_sync_state.change_token),
        initialized_at=coalesce(financial_app.drive_sync_state.initialized_at,excluded.initialized_at),
        updated_at=now(),
        last_mode=excluded.last_mode,
        last_seen_files=excluded.last_seen_files;

  v_changed:=coalesce((v_import->>'changed')::boolean,false) or v_archived>0 or v_reactivated>0;
  return jsonb_build_object('ok',true,'mode',case when coalesce(p_full_scan,false) then 'full' else 'incremental' end,'scanned',coalesce((v_import->>'scanned')::int,0),'valid',coalesce((v_import->>'valid')::int,0),'inserted',coalesce((v_import->>'inserted')::int,0),'updated',coalesce((v_import->>'updated')::int,0),'archived',v_archived,'reactivated',v_reactivated,'removedSignals',cardinality(v_removed),'changed',v_changed,'autoLink',jsonb_build_object('linked',0,'deferred',true),'changeTokenStored',p_next_token is not null);
end
$$;

revoke all on function financial_app.apply_drive_document_delta_core(jsonb,text[],text,boolean) from public,anon,authenticated;
grant execute on function financial_app.apply_drive_document_delta_core(jsonb,text[],text,boolean) to service_role;

create or replace function public.financial_app_apply_drive_document_delta(
  p_files jsonb,
  p_removed_ids text[],
  p_next_token text,
  p_full_scan boolean default false
)
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.apply_drive_document_delta_core(p_files,p_removed_ids,p_next_token,p_full_scan) $$;

revoke all on function public.financial_app_apply_drive_document_delta(jsonb,text[],text,boolean) from public,anon,authenticated;
grant execute on function public.financial_app_apply_drive_document_delta(jsonb,text[],text,boolean) to service_role;

notify pgrst,'reload schema';
commit;
