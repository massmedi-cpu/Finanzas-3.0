begin;

-- Financial App 6.3.2 — permisos internos de Archivo/Revisión.
-- Los cores siguen siendo SECURITY DEFINER y mantienen su comprobación
-- financial_app.authorized_email(); únicamente se permite que los wrappers
-- públicos autenticados lleguen a ejecutar esa validación interna.

grant execute on function financial_app.archive_lifecycle_overview_core(text,text,integer,integer)
  to authenticated, service_role;

grant execute on function financial_app.document_triage_core(integer)
  to authenticated, service_role;

-- No se concede EXECUTE a anon sobre los cores internos.
revoke execute on function financial_app.archive_lifecycle_overview_core(text,text,integer,integer) from anon;
revoke execute on function financial_app.document_triage_core(integer) from anon;

commit;
