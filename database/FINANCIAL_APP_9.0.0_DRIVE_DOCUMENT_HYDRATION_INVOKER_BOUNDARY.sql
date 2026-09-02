begin;

-- Financial App 9.0.0 — frontera de privilegios para hidratación documental de Drive.
-- Conserva íntegramente la lógica y las firmas públicas. Las implementaciones
-- privilegiadas se mueven al esquema privado financial_app y la Data API solo
-- expone wrappers SECURITY INVOKER, siguiendo el patrón canónico del proyecto.

alter function public.financial_app_prepare_drive_document_hydration(integer) set schema financial_app;
alter function financial_app.financial_app_prepare_drive_document_hydration(integer) rename to prepare_drive_document_hydration_core;

alter function public.financial_app_drive_document_hydration_pending(integer) set schema financial_app;
alter function financial_app.financial_app_drive_document_hydration_pending(integer) rename to drive_document_hydration_pending_core;

alter function public.financial_app_drive_document_hydration_source(uuid) set schema financial_app;
alter function financial_app.financial_app_drive_document_hydration_source(uuid) rename to drive_document_hydration_source_core;

alter function public.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) set schema financial_app;
alter function financial_app.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) rename to drive_document_hydration_fail_core;

alter function public.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) set schema financial_app;
alter function financial_app.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) rename to complete_drive_document_hydration_core;

alter function public.financial_app_finalize_document_links_after_hydration() set schema financial_app;
alter function financial_app.financial_app_finalize_document_links_after_hydration() rename to finalize_document_links_after_hydration_core;

create function public.financial_app_prepare_drive_document_hydration(p_limit integer default 100)
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.prepare_drive_document_hydration_core(p_limit)
$wrapper$;

create function public.financial_app_drive_document_hydration_pending(p_limit integer default 1)
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.drive_document_hydration_pending_core(p_limit)
$wrapper$;

create function public.financial_app_drive_document_hydration_source(p_document_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.drive_document_hydration_source_core(p_document_id)
$wrapper$;

create function public.financial_app_drive_document_hydration_fail(
  p_document_id uuid,
  p_source_modified_at text,
  p_error_code text,
  p_retryable boolean default true
)
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.drive_document_hydration_fail_core(
    p_document_id,p_source_modified_at,p_error_code,p_retryable
  )
$wrapper$;

create function public.financial_app_complete_drive_document_hydration(
  p_document_id uuid,
  p_source_modified_at text,
  p_document_type text,
  p_document_date date,
  p_amount numeric,
  p_merchant text,
  p_ocr_text text,
  p_ocr_data jsonb,
  p_ocr_status text
)
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.complete_drive_document_hydration_core(
    p_document_id,p_source_modified_at,p_document_type,p_document_date,p_amount,
    p_merchant,p_ocr_text,p_ocr_data,p_ocr_status
  )
$wrapper$;

create function public.financial_app_finalize_document_links_after_hydration()
returns jsonb
language sql
volatile
security invoker
set search_path to 'pg_catalog','financial_app','auth'
as $wrapper$
  select financial_app.finalize_document_links_after_hydration_core()
$wrapper$;

revoke all on function financial_app.prepare_drive_document_hydration_core(integer) from public,anon;
revoke all on function financial_app.drive_document_hydration_pending_core(integer) from public,anon;
revoke all on function financial_app.drive_document_hydration_source_core(uuid) from public,anon,authenticated;
revoke all on function financial_app.drive_document_hydration_fail_core(uuid,text,text,boolean) from public,anon;
revoke all on function financial_app.complete_drive_document_hydration_core(uuid,text,text,date,numeric,text,text,jsonb,text) from public,anon;
revoke all on function financial_app.finalize_document_links_after_hydration_core() from public,anon;

grant execute on function financial_app.prepare_drive_document_hydration_core(integer) to authenticated,service_role;
grant execute on function financial_app.drive_document_hydration_pending_core(integer) to authenticated,service_role;
grant execute on function financial_app.drive_document_hydration_source_core(uuid) to service_role;
grant execute on function financial_app.drive_document_hydration_fail_core(uuid,text,text,boolean) to authenticated,service_role;
grant execute on function financial_app.complete_drive_document_hydration_core(uuid,text,text,date,numeric,text,text,jsonb,text) to authenticated,service_role;
grant execute on function financial_app.finalize_document_links_after_hydration_core() to authenticated,service_role;

revoke all on function public.financial_app_prepare_drive_document_hydration(integer) from public,anon;
revoke all on function public.financial_app_drive_document_hydration_pending(integer) from public,anon;
revoke all on function public.financial_app_drive_document_hydration_source(uuid) from public,anon,authenticated;
revoke all on function public.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) from public,anon;
revoke all on function public.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) from public,anon;
revoke all on function public.financial_app_finalize_document_links_after_hydration() from public,anon;

grant execute on function public.financial_app_prepare_drive_document_hydration(integer) to authenticated,service_role;
grant execute on function public.financial_app_drive_document_hydration_pending(integer) to authenticated,service_role;
grant execute on function public.financial_app_drive_document_hydration_source(uuid) to service_role;
grant execute on function public.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) to authenticated,service_role;
grant execute on function public.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) to authenticated,service_role;
grant execute on function public.financial_app_finalize_document_links_after_hydration() to authenticated,service_role;

commit;
