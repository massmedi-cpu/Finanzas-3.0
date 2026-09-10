-- Financial App · PRE-001 · cierre de superficie ejecutable
-- Refuerza el rol interno tras activar RLS. Ningún cliente anon/authenticated necesita
-- ejecutar funciones financial_app directamente: toda operación pasa por Edge Gateway.

revoke execute on all functions in schema financial_app from public;
revoke execute on all functions in schema financial_app from anon;
revoke execute on all functions in schema financial_app from authenticated;

-- El contexto de membership se resuelve ANTES de SET ROLE usando la conexión de
-- infraestructura. El rol de negocio no necesita enumerar workspaces ni memberships.
revoke all on table financial_app.workspaces from financial_app_gateway;
revoke all on table financial_app.workspace_memberships from financial_app_gateway;

-- Axioma bancario: el gateway puede leer e insertar observaciones oficiales, pero nunca
-- modificar ni borrar el registro fuente inmutable. Los triggers siguen siendo defensa
-- adicional; esta revocación impone también mínimo privilegio en el rol DB.
revoke update, delete on table financial_app.transaction_source_records from financial_app_gateway;

-- Mantener acceso funcional del dispatcher interno y de las funciones auxiliares que
-- encadenan otras funciones dentro del esquema.
grant execute on all functions in schema financial_app to financial_app_gateway;

-- Las únicas funciones SECURITY DEFINER permitidas son las que necesitan acceder a
-- Vault. Todas ellas se redefinen workspace-scoped en la migración anterior.
do $$
declare
  v_unexpected text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
    E'\n' order by p.proname, p.oid
  )
  into v_unexpected
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app'
    and p.prosecdef=true
    and p.proname not in (
      'store_google_oauth_connection',
      'get_google_oauth_connection_status',
      'get_google_oauth_refresh_token',
      'mark_google_oauth_verified',
      'disconnect_google_oauth_connection'
    );

  if v_unexpected is not null then
    raise exception 'pre001_unexpected_security_definer:%', v_unexpected;
  end if;
end
$$;

-- Evita que funciones futuras recuperen EXECUTE público por el default de PostgreSQL.
-- Se aplica al owner que ejecuta esta migración; el pipeline de migraciones usa el mismo
-- principal para las funciones financial_app.
alter default privileges in schema financial_app revoke execute on functions from public;
