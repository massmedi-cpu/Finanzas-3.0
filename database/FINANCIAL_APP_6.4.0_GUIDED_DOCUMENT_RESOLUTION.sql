begin;

-- Financial App 6.4.0 — resolución documental guiada.
-- Envuelve el triage canónico 6.3 y añade una ruta de pasos explicable.
-- No duplica matching, no cambia prioridades y no ejecuta acciones.

create or replace function financial_app.document_resolution_steps_core(
  p_action text,
  p_link_count integer default 0
)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog','financial_app'
as $function$
declare
  v_steps jsonb := '[]'::jsonb;
  v_linked boolean := coalesce(p_link_count,0)>0;
begin
  if p_action='review_ocr' then
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','review_ocr','label','Revisar OCR','state','current',
      'detail','Corregir o repetir el reconocimiento antes de confiar en los datos extraídos.',
      'requiresUserAction',true
    ));
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','validate_metadata','label','Validar datos','state','next',
      'detail','Comprobar fecha, importe y emisor después de revisar el OCR.',
      'requiresUserAction',true
    ));
    if not v_linked then
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
        'key','resolve_match','label','Resolver asociación','state','next',
        'detail','Buscar o confirmar el movimiento correspondiente con la evidencia ya validada.',
        'requiresUserAction',true
      ));
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','archive','label','Archivar','state','next',
      'detail','Cerrar el flujo documental cuando el justificante quede resuelto.',
      'requiresUserAction',true
    ));
  elsif p_action='complete_metadata' then
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','validate_metadata','label','Completar y validar datos','state','current',
      'detail','Completar fecha, importe o emisor antes de continuar.',
      'requiresUserAction',true
    ));
    if not v_linked then
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
        'key','resolve_match','label','Resolver asociación','state','next',
        'detail','Buscar o confirmar el movimiento correspondiente.',
        'requiresUserAction',true
      ));
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','archive','label','Archivar','state','next',
      'detail','Cerrar el flujo cuando los datos y la asociación estén resueltos.',
      'requiresUserAction',true
    ));
  elsif p_action in('ready_to_link','review_match','investigate_no_match') then
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','resolve_match','label',case when p_action='ready_to_link' then 'Confirmar asociación' when p_action='review_match' then 'Revisar asociación' else 'Investigar asociación' end,
      'state','current',
      'detail',case when p_action='ready_to_link' then 'Revisar el candidato seguro y asociarlo si procede.' when p_action='review_match' then 'Comparar candidatos y elegir únicamente con evidencia suficiente.' else 'Localizar el movimiento correcto o confirmar que aún no existe.' end,
      'requiresUserAction',true
    ));
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','archive','label','Archivar','state','next',
      'detail','Cerrar el flujo documental cuando la asociación quede resuelta.',
      'requiresUserAction',true
    ));
  elsif p_action='archive_candidate' then
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','resolve_match','label','Asociación resuelta','state','done',
      'detail','El documento ya tiene un movimiento asociado.',
      'requiresUserAction',false
    ));
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'key','archive','label','Archivar','state','current',
      'detail','Enviar el justificante al histórico reversible cuando ya no necesite más trabajo.',
      'requiresUserAction',true
    ));
  end if;

  return v_steps;
end
$function$;

create or replace function financial_app.document_resolution_dashboard_core(
  p_limit integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_triage jsonb;
  v_documents jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_triage:=financial_app.document_triage_core(greatest(1,least(coalesce(p_limit,60),100)));

  select coalesce(jsonb_agg(
    d || jsonb_build_object(
      'resolutionPlan',financial_app.document_resolution_steps_core(d->>'action',coalesce((d->>'linkCount')::integer,0))
    ) order by coalesce((d->>'priorityScore')::integer,0) desc
  ),'[]'::jsonb)
  into v_documents
  from jsonb_array_elements(coalesce(v_triage->'documents','[]'::jsonb)) d;

  return jsonb_set(
    jsonb_set(v_triage,'{documents}',v_documents,true),
    '{rules}',
    coalesce(v_triage->'rules','{}'::jsonb)||jsonb_build_object(
      'guidedResolution',true,
      'singleCurrentStep',true,
      'automaticExecution',false,
      'plansAreRecomputedAfterEveryAction',true
    ),
    true
  );
end
$function$;

create or replace function public.financial_app_document_resolution_dashboard(
  p_limit integer default 60
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_resolution_dashboard_core(p_limit)
$function$;

revoke all on function financial_app.document_resolution_steps_core(text,integer) from public,anon,authenticated;
revoke all on function financial_app.document_resolution_dashboard_core(integer) from public,anon,authenticated;
revoke all on function public.financial_app_document_resolution_dashboard(integer) from public,anon;
grant execute on function public.financial_app_document_resolution_dashboard(integer) to authenticated;

commit;
