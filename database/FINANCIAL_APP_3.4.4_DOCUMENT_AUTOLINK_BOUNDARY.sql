begin;

-- Financial App 3.4.4
-- El autoenlace documental deja de exponerse como RPC SECURITY DEFINER.
-- La actualización canónica del documento ejecuta el mismo core privilegiado
-- después de persistir los metadatos, manteniendo la autorización existente.
-- El autoenlace sigue siendo no bloqueante, igual que en el endpoint 3.4.3:
-- un fallo de asociación no revierte una edición/OCR ya válida.
create or replace function financial_app.archive_update_core(
  p_id uuid,
  p_document_type text default null,
  p_document_date date default null,
  p_amount numeric default null,
  p_merchant text default null,
  p_notes text default null,
  p_ocr_text text default null,
  p_ocr_data jsonb default null,
  p_digital_reconstruction jsonb default null,
  p_ocr_status text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_before jsonb;
  v_after jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select to_jsonb(d) into v_before
  from financial_app.documents d
  where d.id=p_id and d.archived_at is null;
  if v_before is null then raise exception 'document not found'; end if;

  if p_document_type is not null and p_document_type not in('invoice','receipt','contract','statement','tax','other') then
    raise exception 'invalid document type';
  end if;
  if p_ocr_status is not null and p_ocr_status not in('pending','processing','complete','manual','error','not_required') then
    raise exception 'invalid ocr status';
  end if;

  update financial_app.documents set
    document_type=coalesce(p_document_type,document_type),
    document_date=p_document_date,
    amount=p_amount,
    merchant=nullif(trim(coalesce(p_merchant,'')),''),
    notes=nullif(trim(coalesce(p_notes,'')),''),
    ocr_text=case when p_ocr_text is null then ocr_text else nullif(trim(p_ocr_text),'') end,
    ocr_data=case when p_ocr_data is null then ocr_data else p_ocr_data end,
    digital_reconstruction=case when p_digital_reconstruction is null then digital_reconstruction else p_digital_reconstruction end,
    ocr_status=coalesce(p_ocr_status,ocr_status),
    updated_at=now()
  where id=p_id;

  select to_jsonb(d) into v_after
  from financial_app.documents d
  where d.id=p_id;

  insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
  values(p_id,'update',v_before,v_after,v_email);

  begin
    perform financial_app.auto_link_documents_core();
  exception when others then
    raise warning 'Financial App document auto-link failed after archive update: %', sqlerrm;
  end;

  return true;
end
$function$;

-- El core continúa siendo privado. Ya no existe un wrapper público privilegiado
-- que pueda invocar un usuario autenticado directamente.
revoke execute on function financial_app.auto_link_documents_core() from public, anon, authenticated;
grant execute on function financial_app.auto_link_documents_core() to service_role;

drop function public.financial_app_auto_link_documents() restrict;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.4.4'::text),now()),
  ('target_version',to_jsonb('3.4.4'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
