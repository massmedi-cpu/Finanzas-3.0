-- Financial App · CR-001A · postflight acumulativo de superficie ejecutable
-- No reescribe migraciones históricas. Revalida el lockdown después de que CR-001A
-- añadiese finalize_workspace_deletion_local(uuid,uuid) como SECURITY DEFINER deliberada.
-- Toda ejecución de negocio sigue pasando exclusivamente por financial_app_gateway.

revoke execute on all functions in schema financial_app from public;
revoke execute on all functions in schema financial_app from anon;
revoke execute on all functions in schema financial_app from authenticated;
revoke execute on all functions in schema financial_app from service_role;

grant execute on all functions in schema financial_app to financial_app_gateway;

-- Evita que funciones futuras recuperen EXECUTE por los defaults de Supabase/PostgreSQL.
alter default privileges for role postgres in schema financial_app
  revoke execute on functions from public;
alter default privileges for role postgres in schema financial_app
  revoke execute on functions from anon;
alter default privileges for role postgres in schema financial_app
  revoke execute on functions from authenticated;
alter default privileges for role postgres in schema financial_app
  revoke execute on functions from service_role;

-- Axioma bancario: ni siquiera el gateway puede modificar o borrar la copia del origen oficial.
revoke update, delete on table financial_app.transaction_source_records from financial_app_gateway;

-- La raíz de tenancy se resuelve antes de SET ROLE; el gateway no enumera workspaces/memberships.
revoke all on table financial_app.workspaces from financial_app_gateway;
revoke all on table financial_app.workspace_memberships from financial_app_gateway;

do $$
declare
  v_unexpected text;
  v_bad_search_path text;
  v_client_executable text;
begin
  -- Allowlist exacto por regprocedure canónico: compara tipos de argumentos, no sus nombres.
  -- La sexta función pertenece al executor CR-001A y necesita privilegios de owner únicamente
  -- para el purge local tras todas las pruebas fail-closed.
  select pg_catalog.string_agg(
    p.oid::pg_catalog.regprocedure::text,
    E'\n' order by p.proname, p.oid
  )
  into v_unexpected
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'financial_app'
    and p.prosecdef = true
    and p.oid::pg_catalog.regprocedure::text not in (
      'financial_app.disconnect_google_oauth_connection()',
      'financial_app.finalize_workspace_deletion_local(uuid,uuid)',
      'financial_app.get_google_oauth_connection_status()',
      'financial_app.get_google_oauth_refresh_token()',
      'financial_app.mark_google_oauth_verified()',
      'financial_app.store_google_oauth_connection(text,text,text,text[],text,text)'
    );

  if v_unexpected is not null then
    raise exception 'cr001_unexpected_security_definer:%', v_unexpected;
  end if;

  select pg_catalog.string_agg(
    p.oid::pg_catalog.regprocedure::text,
    E'\n' order by p.proname, p.oid
  )
  into v_bad_search_path
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'financial_app'
    and p.prosecdef = true
    and not coalesce(p.proconfig @> array['search_path=""']::text[], false);

  if v_bad_search_path is not null then
    raise exception 'cr001_security_definer_unpinned_search_path:%', v_bad_search_path;
  end if;

  select pg_catalog.string_agg(
    p.oid::pg_catalog.regprocedure::text,
    E'\n' order by p.proname, p.oid
  )
  into v_client_executable
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'financial_app'
    and (
      pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    );

  if v_client_executable is not null then
    raise exception 'cr001_client_role_can_execute_financial_function:%', v_client_executable;
  end if;
end
$$;
