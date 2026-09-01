begin;

-- Financial App 9.0.0 — defensa en profundidad de la frontera RPC y allowlist.
-- financial_app_access es una vista pública sobre financial_app.allowed_users.
-- La tabla privada ya tiene RLS y una policy SELECT solo para el propio email habilitado.
-- Esta migración hace que la vista respete ese RLS, elimina permisos de escritura del
-- rol authenticated y añade un guard privado a los nueve RPC públicos que aún eran
-- SECURITY DEFINER.

alter view public.financial_app_access set (security_invoker = true);
revoke all on table public.financial_app_access from public, anon, authenticated;
grant select on table public.financial_app_access to authenticated;

create or replace function financial_app.require_authorized_access()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' or not exists (
    select 1
    from financial_app.allowed_users a
    where a.enabled is true
      and lower(a.email) = v_email
  ) then
    raise exception 'financial_app_access_denied' using errcode = '42501';
  end if;
end
$$;

revoke all on function financial_app.require_authorized_access() from public, anon, authenticated, service_role;
grant execute on function financial_app.require_authorized_access() to authenticated, service_role;

-- Los cores permanecen SECURITY DEFINER y fuera del esquema API público.
-- Los wrappers pasan a SECURITY INVOKER y exigen allowlist antes de llegar al core.
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

-- Autoverificación: cualquier desviación revierte la transacción completa.
do $$
declare
  v_view_invoker boolean;
  v_allowed_rls boolean;
  v_self_policy_count integer;
  v_bad_wrapper_count integer;
  v_bad_core_count integer;
begin
  select coalesce('security_invoker=true' = any(c.reloptions), false)
    into v_view_invoker
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='financial_app_access' and c.relkind='v';

  if not coalesce(v_view_invoker,false) then
    raise exception 'financial_app_rpc_boundary_access_view_must_be_security_invoker';
  end if;

  select c.relrowsecurity into v_allowed_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='financial_app' and c.relname='allowed_users' and c.relkind='r';
  if not coalesce(v_allowed_rls,false) then
    raise exception 'financial_app_rpc_boundary_allowed_users_rls_required';
  end if;

  select count(*) into v_self_policy_count
  from pg_policies
  where schemaname='financial_app' and tablename='allowed_users'
    and policyname='financial_app_allowed_user_read_self'
    and cmd='SELECT';
  if v_self_policy_count <> 1 then
    raise exception 'financial_app_rpc_boundary_allowed_user_self_policy_missing';
  end if;

  if not has_table_privilege('authenticated','public.financial_app_access','SELECT')
     or has_table_privilege('authenticated','public.financial_app_access','INSERT')
     or has_table_privilege('authenticated','public.financial_app_access','UPDATE')
     or has_table_privilege('authenticated','public.financial_app_access','DELETE')
     or has_table_privilege('anon','public.financial_app_access','SELECT') then
    raise exception 'financial_app_rpc_boundary_access_view_privileges_invalid';
  end if;

  if not has_table_privilege('authenticated','financial_app.allowed_users','SELECT')
     or has_table_privilege('authenticated','financial_app.allowed_users','INSERT')
     or has_table_privilege('authenticated','financial_app.allowed_users','UPDATE')
     or has_table_privilege('authenticated','financial_app.allowed_users','DELETE')
     or has_table_privilege('anon','financial_app.allowed_users','SELECT') then
    raise exception 'financial_app_rpc_boundary_allowed_users_privileges_invalid';
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
