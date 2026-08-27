-- Financial App 5.0.1 · OCR integrity status compatibility
-- Applied to production Supabase on 2026-08-27.
-- Backward compatible: preserves all historical statuses and adds
-- needs_review / failed so contradictory machine OCR cannot be stored as complete.

begin;

alter table financial_app.documents
  drop constraint if exists documents_ocr_status_check;

alter table financial_app.documents
  add constraint documents_ocr_status_check
  check (ocr_status = any (array[
    'pending'::text,
    'processing'::text,
    'complete'::text,
    'needs_review'::text,
    'failed'::text,
    'manual'::text,
    'error'::text,
    'not_required'::text
  ]));

create or replace function financial_app.archive_update_core(
  p_id uuid,
  p_document_type text default null::text,
  p_document_date date default null::date,
  p_amount numeric default null::numeric,
  p_merchant text default null::text,
  p_notes text default null::text,
  p_ocr_text text default null::text,
  p_ocr_data jsonb default null::jsonb,
  p_digital_reconstruction jsonb default null::jsonb,
  p_ocr_status text default null::text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'financial_app', 'auth'
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
  if p_ocr_status is not null and p_ocr_status not in('pending','processing','complete','needs_review','failed','manual','error','not_required') then
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

commit;

-- Rollback note:
-- reverting this migration is safe for the previous runtime only after every
-- documents.ocr_status value of needs_review/failed has been converted to a
-- historical supported status. The application rollback itself is the prior
-- READY production deployment; no OCR text/data rows are rewritten here.
