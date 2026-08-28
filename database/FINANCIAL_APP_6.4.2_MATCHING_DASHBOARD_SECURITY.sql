begin;

-- Financial App 6.4.2 — endurecimiento de la frontera RPC del dashboard de matching.
-- Conserva el core privado SECURITY DEFINER con autorización explícita y convierte
-- el wrapper público en SECURITY INVOKER para que el API expuesto no eleve privilegios.

do $$
begin
  if to_regprocedure('public.financial_app_document_matching_dashboard(integer,integer)') is null then
    raise exception 'financial_app_6_4_2_matching_dashboard_wrapper_missing';
  end if;
  if to_regprocedure('financial_app.document_matching_dashboard_core(integer,integer)') is null then
    raise exception 'financial_app_6_4_2_matching_dashboard_core_missing';
  end if;
end
$$;

alter function public.financial_app_document_matching_dashboard(integer,integer) security invoker;
revoke all on function public.financial_app_document_matching_dashboard(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_app_document_matching_dashboard(integer,integer) to authenticated,service_role;

revoke all on function financial_app.document_matching_dashboard_core(integer,integer) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_matching_dashboard_core(integer,integer) to authenticated,service_role;

do $$
declare
  v_wrapper_definer boolean;
  v_core_definer boolean;
begin
  select p.prosecdef into v_wrapper_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_document_matching_dashboard'
    and pg_get_function_identity_arguments(p.oid)='p_limit integer, p_days integer';

  select p.prosecdef into v_core_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='document_matching_dashboard_core'
    and pg_get_function_identity_arguments(p.oid)='p_limit integer, p_days integer';

  if coalesce(v_wrapper_definer,true) then
    raise exception 'financial_app_6_4_2_wrapper_must_be_security_invoker';
  end if;
  if not coalesce(v_core_definer,false) then
    raise exception 'financial_app_6_4_2_core_must_remain_security_definer';
  end if;
  if has_function_privilege('anon','public.financial_app_document_matching_dashboard(integer,integer)','EXECUTE')
    or has_function_privilege('anon','financial_app.document_matching_dashboard_core(integer,integer)','EXECUTE') then
    raise exception 'financial_app_6_4_2_anon_execute_forbidden';
  end if;
  if not has_function_privilege('authenticated','public.financial_app_document_matching_dashboard(integer,integer)','EXECUTE')
    or not has_function_privilege('authenticated','financial_app.document_matching_dashboard_core(integer,integer)','EXECUTE') then
    raise exception 'financial_app_6_4_2_authenticated_chain_incomplete';
  end if;
end
$$;

commit;
