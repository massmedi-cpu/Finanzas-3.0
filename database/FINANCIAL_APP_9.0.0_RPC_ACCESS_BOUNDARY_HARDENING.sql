begin;

-- Financial App 9.0.0 — defensa en profundidad de la frontera RPC y allowlist.
-- Objetivos:
-- 1) una sesión authenticated solo puede leer su propia fila habilitada en financial_app_access;
-- 2) ningún usuario normal puede mutar la allowlist;
-- 3) los nueve wrappers públicos que aún eran SECURITY DEFINER pasan a SECURITY INVOKER;
-- 4) antes de entrar en los cores privados se exige pertenecer a la allowlist;
-- 5) los cores SECURITY DEFINER siguen fuera del esquema API público y anon permanece bloqueado.

alter table public.financial_app_access enable row level security;

revoke all on table public.financial_app_access from public, anon, authenticated;
grant select on table public.financial_app_access to authenticated;

-- La web solo necesita comprobar su propia fila. No se permite enumerar la allowlist.
drop policy if exists financial_app_access_self_read on public.financial_app_access;
create policy financial_app_access_self_read
on public.financial_app_access
for select
to authenticated
using (
  enabled is true
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create or replace function financial_app.require_authorized_access()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' or not exists (
    select 1
    from public.financial_app_access a
    where a.enabled is true
      and lower(a.email) = v_email
  ) then
    raise exception 'financial_app_access_denied' using errcode = '42501';
  end if;
end
$$;

revoke all on function financial_app.require_authorized_access() from public, anon, authenticated, service_role;
grant execute on function financial_app.require_authorized_access() to authenticated, service_role;

-- Los cores permanecen SECURITY DEFINER pero solo son alcanzables por roles firmados,
-- y los wrappers públicos ejecutan primero require_authorized_access().
revoke all on function financial_app.archive_link_calibrated_core(uuid,text) from public,anon,authenticated,service_role;
grant execute on function financial_app.archive_link_calibrated_core(uuid,text) to authenticated,service_role;
revoke all on function financial_app.archive_unlink_calibrated_core(uuid,text) from public,anon,authenticated,service_role;
grant execute on function financial_app.archive_unlink_calibrated_core(uuid,text) to authenticated,service_role;
revoke all on function financial_app.document_matching_calibration_core(integer) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_calibration_core(integer) to authenticated,service_role;
revoke all on function financial_app.document_matching_observability_core(integer) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_observability_core(integer) to authenticated,service_role;
revoke all on function financial_app.document_matching_policy_apply_core(bigint) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_policy_apply_core(bigint) to authenticated,service_role;
revoke all on function financial_app.document_matching_policy_dashboard_core(integer) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_policy_dashboard_core(integer) to authenticated,service_role;
revoke all on function financial_app.document_matching_policy_generate_core(integer) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_policy_generate_core(integer) to authenticated,service_role;
revoke all on function financial_app.document_matching_policy_reject_core(bigint) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_policy_reject_core(bigint) to authenticated,service_role;
revoke all on function financial_app.document_matching_policy_rollback_core() from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_policy_rollback_core() to authenticated,service_role;

create or replace function public.financial_app_archive_link_calibrated(p_document_id uuid, p_source_id text)
returns boolean
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.archive_link_calibrated_core(p_document_id,p_source_id);
$function$;

create or replace function public.financial_app_archive_unlink_calibrated(p_document_id uuid, p_source_id text)
returns boolean
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.archive_unlink_calibrated_core(p_document_id,p_source_id);
$function$;

create or replace function public.financial_app_document_matching_calibration(p_days integer default 90)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_calibration_core(p_days);
$function$;

create or replace function public.financial_app_document_matching_observability(p_limit integer default 8)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_observability_core(p_limit);
$function$;

create or replace function public.financial_app_document_matching_policy_apply(p_proposal_id bigint)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_policy_apply_core(p_proposal_id);
$function$;

create or replace function public.financial_app_document_matching_policy_dashboard(p_days integer default 90)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_policy_dashboard_core(p_days);
$function$;

create or replace function public.financial_app_document_matching_policy_generate(p_days integer default 90)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_policy_generate_core(p_days);
$function$;

create or replace function public.financial_app_document_matching_policy_reject(p_proposal_id bigint)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_policy_reject_core(p_proposal_id);
$function$;

create or replace function public.financial_app_document_matching_policy_rollback()
returns jsonb
language sql
security invoker
set search_path = pg_catalog, financial_app, auth, public
as $function$
  select financial_app.require_authorized_access();
  select financial_app.document_matching_policy_rollback_core();
$function$;

revoke all on function public.financial_app_archive_link_calibrated(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_archive_link_calibrated(uuid,text) to authenticated,service_role;
revoke all on function public.financial_app_archive_unlink_calibrated(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_archive_unlink_calibrated(uuid,text) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_calibration(integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_calibration(integer) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_observability(integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_observability(integer) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_policy_apply(bigint) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_policy_apply(bigint) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_policy_dashboard(integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_policy_dashboard(integer) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_policy_generate(integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_policy_generate(integer) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_policy_reject(bigint) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_policy_reject(bigint) to authenticated,service_role;
revoke all on function public.financial_app_document_matching_policy_rollback() from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_policy_rollback() to authenticated,service_role;

-- Autoverificación de la migración: si cualquier contrato queda incompleto se revierte todo.
do $$
declare
  v_rls boolean;
  v_bad_wrapper_count integer;
  v_bad_core_count integer;
  v_policy_count integer;
begin
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='financial_app_access';

  if not coalesce(v_rls,false) then
    raise exception 'financial_app_rpc_boundary_access_rls_required';
  end if;

  if not has_table_privilege('authenticated','public.financial_app_access','SELECT')
     or has_table_privilege('authenticated','public.financial_app_access','INSERT')
     or has_table_privilege('authenticated','public.financial_app_access','UPDATE')
     or has_table_privilege('authenticated','public.financial_app_access','DELETE')
     or has_table_privilege('anon','public.financial_app_access','SELECT') then
    raise exception 'financial_app_rpc_boundary_access_privileges_invalid';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='financial_app_access'
    and policyname='financial_app_access_self_read';
  if v_policy_count <> 1 then
    raise exception 'financial_app_rpc_boundary_self_policy_missing';
  end if;

  if not has_function_privilege('authenticated','financial_app.require_authorized_access()','EXECUTE')
     or has_function_privilege('anon','financial_app.require_authorized_access()','EXECUTE') then
    raise exception 'financial_app_rpc_boundary_guard_privileges_invalid';
  end if;

  select count(*) into v_bad_wrapper_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'financial_app_archive_link_calibrated','financial_app_archive_unlink_calibrated',
      'financial_app_document_matching_calibration','financial_app_document_matching_observability',
      'financial_app_document_matching_policy_apply','financial_app_document_matching_policy_dashboard',
      'financial_app_document_matching_policy_generate','financial_app_document_matching_policy_reject',
      'financial_app_document_matching_policy_rollback'
    )
    and (p.prosecdef
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or not has_function_privilege('authenticated',p.oid,'EXECUTE')
      or position('require_authorized_access' in pg_get_functiondef(p.oid))=0);
  if v_bad_wrapper_count <> 0 then
    raise exception 'financial_app_rpc_boundary_public_wrapper_invalid';
  end if;

  select count(*) into v_bad_core_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app'
    and p.proname in (
      'archive_link_calibrated_core','archive_unlink_calibrated_core',
      'document_matching_calibration_core','document_matching_observability_core',
      'document_matching_policy_apply_core','document_matching_policy_dashboard_core',
      'document_matching_policy_generate_core','document_matching_policy_reject_core',
      'document_matching_policy_rollback_core'
    )
    and (not p.prosecdef
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or not has_function_privilege('authenticated',p.oid,'EXECUTE'));
  if v_bad_core_count <> 0 then
    raise exception 'financial_app_rpc_boundary_private_core_invalid';
  end if;
end
$$;

commit;
