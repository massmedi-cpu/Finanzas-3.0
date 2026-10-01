-- Financial App · PRE-034 · cierre de integridad OCR §§113/118
-- Completa Hora + Líneas, restaura RLS/SECURITY INVOKER de PRE-001 y hace la
-- trazabilidad OCR coherente por workspace. No toca la fuente bancaria.

alter table financial_app.documents
  add column if not exists document_time time without time zone null,
  add column if not exists line_items jsonb not null default '[]'::jsonb;

alter table financial_app.documents
  drop constraint if exists documents_line_items_array_check,
  add constraint documents_line_items_array_check
    check (jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) <= 200);

-- Las tablas OCR nacieron después de PRE-001: reciben ahora las mismas defensas
-- de tenant que el resto del dominio, sin depender de SECURITY DEFINER.
alter table financial_app.document_ocr_runs enable row level security;
alter table financial_app.document_ocr_runs force row level security;
alter table financial_app.document_ocr_reviews enable row level security;
alter table financial_app.document_ocr_reviews force row level security;

drop policy if exists document_ocr_runs_workspace_select on financial_app.document_ocr_runs;
create policy document_ocr_runs_workspace_select
  on financial_app.document_ocr_runs
  for select
  to financial_app_gateway
  using (workspace_id = financial_app.require_current_workspace_id());

drop policy if exists document_ocr_runs_workspace_insert on financial_app.document_ocr_runs;
create policy document_ocr_runs_workspace_insert
  on financial_app.document_ocr_runs
  for insert
  to financial_app_gateway
  with check (workspace_id = financial_app.require_current_workspace_id());

drop policy if exists document_ocr_reviews_workspace_select on financial_app.document_ocr_reviews;
create policy document_ocr_reviews_workspace_select
  on financial_app.document_ocr_reviews
  for select
  to financial_app_gateway
  using (workspace_id = financial_app.require_current_workspace_id());

drop policy if exists document_ocr_reviews_workspace_insert on financial_app.document_ocr_reviews;
create policy document_ocr_reviews_workspace_insert
  on financial_app.document_ocr_reviews
  for insert
  to financial_app_gateway
  with check (workspace_id = financial_app.require_current_workspace_id());

revoke all on table financial_app.document_ocr_runs from financial_app_gateway;
revoke all on table financial_app.document_ocr_reviews from financial_app_gateway;
grant select, insert on table financial_app.document_ocr_runs to financial_app_gateway;
grant select, insert on table financial_app.document_ocr_reviews to financial_app_gateway;

-- Identidad compuesta: un UUID válido de otro workspace no puede enlazarse ni
-- siquiera por una ruta de mantenimiento privilegiada. RESTRICT conserva evidencia.
create unique index if not exists documents_workspace_id_unique
  on financial_app.documents(workspace_id, id);
create unique index if not exists document_ocr_runs_workspace_id_unique
  on financial_app.document_ocr_runs(workspace_id, id);

alter table financial_app.document_ocr_runs
  drop constraint if exists document_ocr_runs_document_id_fkey,
  drop constraint if exists document_ocr_runs_document_workspace_fkey,
  add constraint document_ocr_runs_document_workspace_fkey
    foreign key (workspace_id, document_id)
    references financial_app.documents(workspace_id, id)
    on delete restrict;

alter table financial_app.document_ocr_reviews
  drop constraint if exists document_ocr_reviews_document_id_fkey,
  drop constraint if exists document_ocr_reviews_ocr_run_id_fkey,
  drop constraint if exists document_ocr_reviews_document_workspace_fkey,
  drop constraint if exists document_ocr_reviews_run_workspace_fkey,
  add constraint document_ocr_reviews_document_workspace_fkey
    foreign key (workspace_id, document_id)
    references financial_app.documents(workspace_id, id)
    on delete restrict,
  add constraint document_ocr_reviews_run_workspace_fkey
    foreign key (workspace_id, ocr_run_id)
    references financial_app.document_ocr_runs(workspace_id, id)
    on delete restrict;

-- Evidencia y revisiones son append-only. También se bloquea DELETE: si existe
-- evidencia OCR, el documento no puede desaparecer por cascada silenciosa.
drop trigger if exists document_ocr_runs_no_update on financial_app.document_ocr_runs;
create trigger document_ocr_runs_no_update
before update or delete on financial_app.document_ocr_runs
for each row execute function financial_app.protect_document_ocr_evidence();

drop trigger if exists document_ocr_reviews_no_update on financial_app.document_ocr_reviews;
create trigger document_ocr_reviews_no_update
before update or delete on financial_app.document_ocr_reviews
for each row execute function financial_app.protect_document_ocr_evidence();

alter function financial_app.store_document_ocr_run(uuid,jsonb,jsonb) security invoker;
alter function financial_app.document_ocr_history(uuid) security invoker;

revoke all on function financial_app.store_document_ocr_run(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function financial_app.document_ocr_history(uuid) from public, anon, authenticated;
grant execute on function financial_app.store_document_ocr_run(uuid,jsonb,jsonb) to financial_app_gateway;
grant execute on function financial_app.document_ocr_history(uuid) to financial_app_gateway;

-- Sustituye el contrato de confirmación incompleto por el contrato Axioma §113.
drop function if exists financial_app.confirm_document_ocr_review(
  uuid,uuid,text,date,text,text,text,text,bigint,bigint,bigint,text,text
);

create function financial_app.confirm_document_ocr_review(
  p_document_id uuid,
  p_ocr_run_id uuid,
  p_type text,
  p_document_date date,
  p_document_time time without time zone,
  p_issuer_name text,
  p_issuer_tax_id text,
  p_document_number text,
  p_billing_period text,
  p_tax_base_cents bigint,
  p_taxes_cents bigint,
  p_total_cents bigint,
  p_payment_method text,
  p_line_items jsonb,
  p_notes text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_run financial_app.document_ocr_runs%rowtype;
  v_revision integer;
  v_review_values jsonb;
  v_changed_fields jsonb := '[]'::jsonb;
  v_source jsonb := null;
  v_line_items jsonb := coalesce(p_line_items, '[]'::jsonb);
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id
  for update;
  if not found then raise exception 'document_not_found'; end if;

  if p_type not in ('ticket','invoice','other') then raise exception 'invalid_document_type'; end if;
  if p_issuer_name is not null and char_length(trim(p_issuer_name)) > 300 then raise exception 'invalid_document_issuer'; end if;
  if p_issuer_tax_id is not null and char_length(trim(p_issuer_tax_id)) > 40 then raise exception 'invalid_document_issuer_tax_id'; end if;
  if p_document_number is not null and char_length(trim(p_document_number)) > 120 then raise exception 'invalid_document_number'; end if;
  if p_billing_period is not null and char_length(trim(p_billing_period)) > 200 then raise exception 'invalid_document_billing_period'; end if;
  if p_payment_method is not null and char_length(trim(p_payment_method)) > 120 then raise exception 'invalid_document_payment_method'; end if;
  if p_notes is null or char_length(p_notes) > 2000 then raise exception 'invalid_document_notes'; end if;
  if p_tax_base_cents is not null and abs(p_tax_base_cents) > 9007199254740991 then raise exception 'invalid_document_tax_base'; end if;
  if p_taxes_cents is not null and abs(p_taxes_cents) > 9007199254740991 then raise exception 'invalid_document_taxes'; end if;
  if p_total_cents is not null and abs(p_total_cents) > 9007199254740991 then raise exception 'invalid_document_total'; end if;
  if jsonb_typeof(v_line_items) <> 'array' or jsonb_array_length(v_line_items) > 200 then raise exception 'invalid_document_line_items'; end if;
  if exists (
    select 1
    from jsonb_array_elements(v_line_items) item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'description') <> 'string'
      or char_length(trim(item->>'description')) not between 1 and 500
  ) then raise exception 'invalid_document_line_items'; end if;

  if p_ocr_run_id is not null then
    select * into v_run
    from financial_app.document_ocr_runs
    where workspace_id=v_workspace_id and id=p_ocr_run_id and document_id=p_document_id;
    if not found then raise exception 'document_ocr_run_not_found'; end if;
    v_source := v_run.interpretation;
  end if;

  v_review_values := jsonb_build_object(
    'type', p_type,
    'documentDate', p_document_date,
    'documentTime', case when p_document_time is null then null else to_char(p_document_time,'HH24:MI') end,
    'issuerName', nullif(trim(coalesce(p_issuer_name,'')),''),
    'issuerTaxId', nullif(trim(coalesce(p_issuer_tax_id,'')),''),
    'documentNumber', nullif(trim(coalesce(p_document_number,'')),''),
    'billingPeriod', nullif(trim(coalesce(p_billing_period,'')),''),
    'taxBaseCents', p_tax_base_cents,
    'taxesCents', p_taxes_cents,
    'totalCents', p_total_cents,
    'paymentMethod', nullif(trim(coalesce(p_payment_method,'')),''),
    'lineItems', v_line_items,
    'notes', p_notes
  );

  if v_document.type is distinct from p_type then v_changed_fields := v_changed_fields || '"type"'::jsonb; end if;
  if v_document.document_date is distinct from p_document_date then v_changed_fields := v_changed_fields || '"documentDate"'::jsonb; end if;
  if v_document.document_time is distinct from p_document_time then v_changed_fields := v_changed_fields || '"documentTime"'::jsonb; end if;
  if v_document.issuer_name is distinct from nullif(trim(coalesce(p_issuer_name,'')),'') then v_changed_fields := v_changed_fields || '"issuerName"'::jsonb; end if;
  if v_document.issuer_tax_id is distinct from nullif(trim(coalesce(p_issuer_tax_id,'')),'') then v_changed_fields := v_changed_fields || '"issuerTaxId"'::jsonb; end if;
  if v_document.document_number is distinct from nullif(trim(coalesce(p_document_number,'')),'') then v_changed_fields := v_changed_fields || '"documentNumber"'::jsonb; end if;
  if v_document.billing_period is distinct from nullif(trim(coalesce(p_billing_period,'')),'') then v_changed_fields := v_changed_fields || '"billingPeriod"'::jsonb; end if;
  if v_document.tax_base_cents is distinct from p_tax_base_cents then v_changed_fields := v_changed_fields || '"taxBaseCents"'::jsonb; end if;
  if v_document.taxes_cents is distinct from p_taxes_cents then v_changed_fields := v_changed_fields || '"taxesCents"'::jsonb; end if;
  if v_document.total_cents is distinct from p_total_cents then v_changed_fields := v_changed_fields || '"totalCents"'::jsonb; end if;
  if v_document.payment_method is distinct from nullif(trim(coalesce(p_payment_method,'')),'') then v_changed_fields := v_changed_fields || '"paymentMethod"'::jsonb; end if;
  if v_document.line_items is distinct from v_line_items then v_changed_fields := v_changed_fields || '"lineItems"'::jsonb; end if;
  if v_document.notes is distinct from p_notes then v_changed_fields := v_changed_fields || '"notes"'::jsonb; end if;

  select coalesce(max(revision),0)+1 into v_revision
  from financial_app.document_ocr_reviews
  where workspace_id=v_workspace_id and document_id=p_document_id;

  insert into financial_app.document_ocr_reviews(
    workspace_id,document_id,ocr_run_id,revision,review_state,
    reviewed_values,source_interpretation,changed_fields
  ) values (
    v_workspace_id,p_document_id,p_ocr_run_id,v_revision,
    case when p_ocr_run_id is null then 'manual_without_ocr' else 'confirmed' end,
    v_review_values,v_source,v_changed_fields
  );

  update financial_app.documents
  set type=p_type,
      document_date=p_document_date,
      document_time=p_document_time,
      issuer_name=nullif(trim(coalesce(p_issuer_name,'')),''),
      issuer_tax_id=nullif(trim(coalesce(p_issuer_tax_id,'')),''),
      document_number=nullif(trim(coalesce(p_document_number,'')),''),
      billing_period=nullif(trim(coalesce(p_billing_period,'')),''),
      tax_base_cents=p_tax_base_cents,
      taxes_cents=p_taxes_cents,
      total_cents=p_total_cents,
      payment_method=nullif(trim(coalesce(p_payment_method,'')),''),
      line_items=v_line_items,
      notes=p_notes,
      status='confirmed',
      updated_at=now()
  where workspace_id=v_workspace_id and id=p_document_id;

  insert into financial_app.audit_changes(
    workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin
  ) values (
    v_workspace_id,'document',p_document_id,'ocr_review',
    jsonb_build_object(
      'type',v_document.type,
      'documentDate',v_document.document_date,
      'documentTime',case when v_document.document_time is null then null else to_char(v_document.document_time,'HH24:MI') end,
      'issuerName',v_document.issuer_name,
      'issuerTaxId',v_document.issuer_tax_id,
      'documentNumber',v_document.document_number,
      'billingPeriod',v_document.billing_period,
      'taxBaseCents',v_document.tax_base_cents,
      'taxesCents',v_document.taxes_cents,
      'totalCents',v_document.total_cents,
      'paymentMethod',v_document.payment_method,
      'lineItems',v_document.line_items,
      'notes',v_document.notes,
      'status',v_document.status
    ),
    v_review_values || jsonb_build_object('status','confirmed','revision',v_revision),
    'user'
  );

  return jsonb_build_object(
    'contractVersion',2,
    'documentId',p_document_id,
    'ocrRunId',p_ocr_run_id,
    'revision',v_revision,
    'reviewedValues',v_review_values,
    'changedFields',v_changed_fields,
    'rawEvidenceImmutable',true,
    'bankSource','read_only',
    'financialWrites',false,
    'requiresHumanReview',true
  );
end;
$$;

revoke all on function financial_app.confirm_document_ocr_review(
  uuid,uuid,text,date,time without time zone,text,text,text,text,bigint,bigint,bigint,text,jsonb,text
) from public, anon, authenticated;
grant execute on function financial_app.confirm_document_ocr_review(
  uuid,uuid,text,date,time without time zone,text,text,text,text,bigint,bigint,bigint,text,jsonb,text
) to financial_app_gateway;

-- Reexpone el detalle documental completo: al reabrir, no se pierden los datos
-- confirmados del contrato OCR. La lista se mantiene ligera.
create or replace function financial_app.document_detail(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_associations jsonb;
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=financial_app.require_current_workspace_id() and id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'transactionId', a.transaction_id,
      'method', a.method,
      'confidence', a.confidence,
      'confirmed', a.confirmed,
      'date', t.bank_date,
      'amountCents', t.amount_cents,
      'concept', t.concept_normalized,
      'accountId', t.account_id,
      'accountName', ac.name,
      'merchantId', f.effective_merchant_id,
      'merchantName', m.name,
      'categoryId', f.effective_category_id,
      'effectiveKind', f.effective_kind,
      'createdAt', a.created_at,
      'updatedAt', a.updated_at
    ) order by t.bank_date desc, a.created_at desc
  ), '[]'::jsonb)
  into v_associations
  from financial_app.document_transaction_associations a
  join financial_app.transactions t on t.id=a.transaction_id
  join financial_app.accounts ac on ac.id=t.account_id
  left join financial_app.financial_transaction_facts() f on f.transaction_id=t.id
  left join financial_app.merchants m on m.id=f.effective_merchant_id
  where a.workspace_id=v_document.workspace_id
    and a.document_id=p_document_id
    and a.confirmed=true;

  return jsonb_build_object(
    'contractVersion', 2,
    'document', jsonb_build_object(
      'id', v_document.id,
      'type', v_document.type,
      'status', v_document.status,
      'originalFileName', v_document.original_file_name,
      'mimeType', v_document.mime_type,
      'storageProvider', v_document.storage_provider,
      'storageKey', v_document.storage_key,
      'sourceDriveFileId', v_document.source_drive_file_id,
      'documentDate', v_document.document_date,
      'documentTime', case when v_document.document_time is null then null else to_char(v_document.document_time,'HH24:MI') end,
      'issuerName', v_document.issuer_name,
      'issuerTaxId', v_document.issuer_tax_id,
      'documentNumber', v_document.document_number,
      'billingPeriod', v_document.billing_period,
      'taxBaseCents', v_document.tax_base_cents,
      'taxesCents', v_document.taxes_cents,
      'totalCents', v_document.total_cents,
      'paymentMethod', v_document.payment_method,
      'lineItems', v_document.line_items,
      'sizeBytes', v_document.size_bytes,
      'sourceModifiedAt', v_document.source_modified_at,
      'notes', v_document.notes,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at
    ),
    'associations', v_associations,
    'principles', jsonb_build_object(
      'ocrEnabled', true,
      'bankSource', 'read_only',
      'suggestionsPersisted', false,
      'associationsRequireConfirmation', true,
      'getHasSideEffects', false
    )
  );
end;
$$;

revoke all on function financial_app.document_detail(uuid) from public, anon, authenticated;
grant execute on function financial_app.document_detail(uuid) to financial_app_gateway;
