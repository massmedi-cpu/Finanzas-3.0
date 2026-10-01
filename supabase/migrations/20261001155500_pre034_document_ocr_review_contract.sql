-- Financial App · PRE-034 · Axioma §§112-118
-- Separa estrictamente reconocimiento OCR, interpretación financiera y revisión humana.
-- La fuente bancaria permanece fuera de toda mutación de este contrato.

alter table financial_app.documents
  add column if not exists issuer_tax_id text null,
  add column if not exists document_number text null,
  add column if not exists billing_period text null,
  add column if not exists tax_base_cents bigint null,
  add column if not exists taxes_cents bigint null,
  add column if not exists payment_method text null;

alter table financial_app.documents
  drop constraint if exists documents_issuer_tax_id_length_check,
  add constraint documents_issuer_tax_id_length_check
    check (issuer_tax_id is null or char_length(issuer_tax_id) between 1 and 40),
  drop constraint if exists documents_document_number_length_check,
  add constraint documents_document_number_length_check
    check (document_number is null or char_length(document_number) between 1 and 120),
  drop constraint if exists documents_billing_period_length_check,
  add constraint documents_billing_period_length_check
    check (billing_period is null or char_length(billing_period) between 1 and 200),
  drop constraint if exists documents_tax_base_cents_check,
  add constraint documents_tax_base_cents_check
    check (tax_base_cents is null or tax_base_cents between -9007199254740991 and 9007199254740991),
  drop constraint if exists documents_taxes_cents_check,
  add constraint documents_taxes_cents_check
    check (taxes_cents is null or taxes_cents between -9007199254740991 and 9007199254740991),
  drop constraint if exists documents_payment_method_length_check,
  add constraint documents_payment_method_length_check
    check (payment_method is null or char_length(payment_method) between 1 and 120);

create table if not exists financial_app.document_ocr_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references financial_app.workspaces(id) on delete restrict,
  document_id uuid not null references financial_app.documents(id) on delete cascade,
  contract_version integer not null check (contract_version > 0),
  interpretation_version integer not null check (interpretation_version > 0),
  status text not null check (status in ('ready','needs_review','empty','failed')),
  extractor text not null check (char_length(extractor) between 1 and 120),
  confidence numeric(5,4) null check (confidence is null or confidence between 0 and 1),
  raw_result jsonb not null,
  interpretation jsonb not null,
  extracted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint document_ocr_runs_raw_object_check check (jsonb_typeof(raw_result) = 'object'),
  constraint document_ocr_runs_interpretation_object_check check (jsonb_typeof(interpretation) = 'object'),
  constraint document_ocr_runs_guardrails_check check (
    raw_result #>> '{principles,bankSource}' = 'read_only'
    and coalesce((raw_result #>> '{principles,financialWrites}')::boolean, true) = false
    and coalesce((raw_result #>> '{principles,requiresHumanReview}')::boolean, false) = true
  )
);

create index if not exists document_ocr_runs_document_created_idx
  on financial_app.document_ocr_runs(workspace_id, document_id, created_at desc, id desc);
create unique index if not exists document_ocr_runs_idempotency_idx
  on financial_app.document_ocr_runs(workspace_id, document_id, extractor, extracted_at);

create table if not exists financial_app.document_ocr_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references financial_app.workspaces(id) on delete restrict,
  document_id uuid not null references financial_app.documents(id) on delete cascade,
  ocr_run_id uuid null references financial_app.document_ocr_runs(id) on delete set null,
  revision integer not null check (revision > 0),
  review_state text not null check (review_state in ('confirmed','manual_without_ocr')),
  reviewed_values jsonb not null,
  source_interpretation jsonb null,
  changed_fields jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint document_ocr_reviews_values_object_check check (jsonb_typeof(reviewed_values) = 'object'),
  constraint document_ocr_reviews_source_object_check check (source_interpretation is null or jsonb_typeof(source_interpretation) = 'object'),
  constraint document_ocr_reviews_changed_fields_array_check check (jsonb_typeof(changed_fields) = 'array'),
  unique(workspace_id, document_id, revision)
);

create index if not exists document_ocr_reviews_document_revision_idx
  on financial_app.document_ocr_reviews(workspace_id, document_id, revision desc);

alter table financial_app.document_ocr_runs enable row level security;
alter table financial_app.document_ocr_reviews enable row level security;
revoke all on table financial_app.document_ocr_runs from public, anon, authenticated;
revoke all on table financial_app.document_ocr_reviews from public, anon, authenticated;
grant select, insert, delete on table financial_app.document_ocr_runs to service_role;
grant select, insert, delete on table financial_app.document_ocr_reviews to service_role;

create or replace function financial_app.protect_document_ocr_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'document_ocr_evidence_is_immutable';
end;
$$;

drop trigger if exists document_ocr_runs_no_update on financial_app.document_ocr_runs;
create trigger document_ocr_runs_no_update
before update on financial_app.document_ocr_runs
for each row execute function financial_app.protect_document_ocr_evidence();

drop trigger if exists document_ocr_reviews_no_update on financial_app.document_ocr_reviews;
create trigger document_ocr_reviews_no_update
before update on financial_app.document_ocr_reviews
for each row execute function financial_app.protect_document_ocr_evidence();

create or replace function financial_app.store_document_ocr_run(
  p_document_id uuid,
  p_raw_result jsonb,
  p_interpretation jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document_workspace_id uuid;
  v_id uuid;
  v_contract_version integer;
  v_interpretation_version integer;
  v_status text;
  v_extractor text;
  v_confidence numeric;
  v_extracted_at timestamptz;
begin
  select workspace_id into v_document_workspace_id
  from financial_app.documents
  where id = p_document_id;
  if not found then raise exception 'document_not_found'; end if;
  perform financial_app.assert_workspace_reference(v_workspace_id, v_document_workspace_id);

  if p_raw_result is null or jsonb_typeof(p_raw_result) <> 'object' then raise exception 'invalid_document_ocr_result'; end if;
  if p_interpretation is null or jsonb_typeof(p_interpretation) <> 'object' then raise exception 'invalid_document_ocr_interpretation'; end if;
  if p_raw_result #>> '{principles,bankSource}' <> 'read_only'
     or coalesce((p_raw_result #>> '{principles,financialWrites}')::boolean, true) <> false
     or coalesce((p_raw_result #>> '{principles,requiresHumanReview}')::boolean, false) <> true then
    raise exception 'invalid_document_ocr_guardrails';
  end if;

  v_contract_version := nullif(p_raw_result->>'contractVersion','')::integer;
  v_interpretation_version := nullif(p_interpretation->>'interpretationVersion','')::integer;
  v_status := p_raw_result->>'status';
  v_extractor := nullif(trim(p_raw_result->>'extractor'),'');
  v_confidence := nullif(p_raw_result->>'confidence','')::numeric;
  v_extracted_at := nullif(p_raw_result->>'extractedAt','')::timestamptz;

  if v_contract_version is null or v_contract_version < 1 then raise exception 'invalid_document_ocr_contract_version'; end if;
  if v_interpretation_version is null or v_interpretation_version < 1 then raise exception 'invalid_document_ocr_interpretation_version'; end if;
  if v_status not in ('ready','needs_review','empty','failed') then raise exception 'invalid_document_ocr_status'; end if;
  if v_extractor is null or char_length(v_extractor) > 120 then raise exception 'invalid_document_ocr_extractor'; end if;
  if v_confidence is not null and (v_confidence < 0 or v_confidence > 1) then raise exception 'invalid_document_ocr_confidence'; end if;
  if v_extracted_at is null then raise exception 'invalid_document_ocr_extracted_at'; end if;

  insert into financial_app.document_ocr_runs(
    workspace_id, document_id, contract_version, interpretation_version,
    status, extractor, confidence, raw_result, interpretation, extracted_at
  ) values (
    v_workspace_id, p_document_id, v_contract_version, v_interpretation_version,
    v_status, v_extractor, v_confidence, p_raw_result, p_interpretation, v_extracted_at
  )
  on conflict (workspace_id, document_id, extractor, extracted_at) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from financial_app.document_ocr_runs
    where workspace_id = v_workspace_id
      and document_id = p_document_id
      and extractor = v_extractor
      and extracted_at = v_extracted_at;
  end if;

  update financial_app.documents
  set status = case when status='imported' then 'pending_review' else status end,
      updated_at = now()
  where id = p_document_id;

  return jsonb_build_object(
    'contractVersion', 1,
    'ocrRunId', v_id,
    'documentId', p_document_id,
    'persisted', true,
    'rawEvidenceImmutable', true,
    'requiresHumanReview', true,
    'bankSource', 'read_only'
  );
end;
$$;

create or replace function financial_app.confirm_document_ocr_review(
  p_document_id uuid,
  p_ocr_run_id uuid,
  p_type text,
  p_document_date date,
  p_issuer_name text,
  p_issuer_tax_id text,
  p_document_number text,
  p_billing_period text,
  p_tax_base_cents bigint,
  p_taxes_cents bigint,
  p_total_cents bigint,
  p_payment_method text,
  p_notes text
) returns jsonb
language plpgsql
security definer
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
begin
  select * into v_document
  from financial_app.documents
  where id = p_document_id
  for update;
  if not found then raise exception 'document_not_found'; end if;
  perform financial_app.assert_workspace_reference(v_workspace_id, v_document.workspace_id);

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

  if p_ocr_run_id is not null then
    select * into v_run
    from financial_app.document_ocr_runs
    where id = p_ocr_run_id and document_id = p_document_id;
    if not found then raise exception 'document_ocr_run_not_found'; end if;
    perform financial_app.assert_workspace_reference(v_workspace_id, v_run.workspace_id);
    v_source := v_run.interpretation;
  end if;

  v_review_values := jsonb_build_object(
    'type', p_type,
    'documentDate', p_document_date,
    'issuerName', nullif(trim(coalesce(p_issuer_name,'')),''),
    'issuerTaxId', nullif(trim(coalesce(p_issuer_tax_id,'')),''),
    'documentNumber', nullif(trim(coalesce(p_document_number,'')),''),
    'billingPeriod', nullif(trim(coalesce(p_billing_period,'')),''),
    'taxBaseCents', p_tax_base_cents,
    'taxesCents', p_taxes_cents,
    'totalCents', p_total_cents,
    'paymentMethod', nullif(trim(coalesce(p_payment_method,'')),''),
    'notes', p_notes
  );

  if v_document.type is distinct from p_type then v_changed_fields := v_changed_fields || '"type"'::jsonb; end if;
  if v_document.document_date is distinct from p_document_date then v_changed_fields := v_changed_fields || '"documentDate"'::jsonb; end if;
  if v_document.issuer_name is distinct from nullif(trim(coalesce(p_issuer_name,'')),'') then v_changed_fields := v_changed_fields || '"issuerName"'::jsonb; end if;
  if v_document.issuer_tax_id is distinct from nullif(trim(coalesce(p_issuer_tax_id,'')),'') then v_changed_fields := v_changed_fields || '"issuerTaxId"'::jsonb; end if;
  if v_document.document_number is distinct from nullif(trim(coalesce(p_document_number,'')),'') then v_changed_fields := v_changed_fields || '"documentNumber"'::jsonb; end if;
  if v_document.billing_period is distinct from nullif(trim(coalesce(p_billing_period,'')),'') then v_changed_fields := v_changed_fields || '"billingPeriod"'::jsonb; end if;
  if v_document.tax_base_cents is distinct from p_tax_base_cents then v_changed_fields := v_changed_fields || '"taxBaseCents"'::jsonb; end if;
  if v_document.taxes_cents is distinct from p_taxes_cents then v_changed_fields := v_changed_fields || '"taxesCents"'::jsonb; end if;
  if v_document.total_cents is distinct from p_total_cents then v_changed_fields := v_changed_fields || '"totalCents"'::jsonb; end if;
  if v_document.payment_method is distinct from nullif(trim(coalesce(p_payment_method,'')),'') then v_changed_fields := v_changed_fields || '"paymentMethod"'::jsonb; end if;
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
      issuer_name=nullif(trim(coalesce(p_issuer_name,'')),''),
      issuer_tax_id=nullif(trim(coalesce(p_issuer_tax_id,'')),''),
      document_number=nullif(trim(coalesce(p_document_number,'')),''),
      billing_period=nullif(trim(coalesce(p_billing_period,'')),''),
      tax_base_cents=p_tax_base_cents,
      taxes_cents=p_taxes_cents,
      total_cents=p_total_cents,
      payment_method=nullif(trim(coalesce(p_payment_method,'')),''),
      notes=p_notes,
      status='confirmed',
      updated_at=now()
  where id=p_document_id;

  insert into financial_app.audit_changes(
    workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin
  ) values (
    v_workspace_id,'document',p_document_id,'ocr_review',
    jsonb_build_object(
      'type',v_document.type,'documentDate',v_document.document_date,'issuerName',v_document.issuer_name,
      'issuerTaxId',v_document.issuer_tax_id,'documentNumber',v_document.document_number,
      'billingPeriod',v_document.billing_period,'taxBaseCents',v_document.tax_base_cents,
      'taxesCents',v_document.taxes_cents,'totalCents',v_document.total_cents,
      'paymentMethod',v_document.payment_method,'notes',v_document.notes,'status',v_document.status
    ),
    v_review_values || jsonb_build_object('status','confirmed','revision',v_revision),
    'user'
  );

  return jsonb_build_object(
    'contractVersion',1,
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

create or replace function financial_app.document_ocr_history(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document_workspace_id uuid;
  v_runs jsonb;
  v_reviews jsonb;
begin
  select workspace_id into v_document_workspace_id from financial_app.documents where id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;
  perform financial_app.assert_workspace_reference(v_workspace_id, v_document_workspace_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'contractVersion',r.contract_version,
    'interpretationVersion',r.interpretation_version,
    'status',r.status,
    'extractor',r.extractor,
    'confidence',r.confidence,
    'interpretation',r.interpretation,
    'extractedAt',r.extracted_at,
    'createdAt',r.created_at
  ) order by r.created_at desc,r.id desc),'[]'::jsonb)
  into v_runs
  from financial_app.document_ocr_runs r
  where r.workspace_id=v_workspace_id and r.document_id=p_document_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',rv.id,
    'ocrRunId',rv.ocr_run_id,
    'revision',rv.revision,
    'reviewState',rv.review_state,
    'reviewedValues',rv.reviewed_values,
    'sourceInterpretation',rv.source_interpretation,
    'changedFields',rv.changed_fields,
    'confirmedAt',rv.confirmed_at
  ) order by rv.revision desc),'[]'::jsonb)
  into v_reviews
  from financial_app.document_ocr_reviews rv
  where rv.workspace_id=v_workspace_id and rv.document_id=p_document_id;

  return jsonb_build_object(
    'contractVersion',1,
    'documentId',p_document_id,
    'runs',v_runs,
    'reviews',v_reviews,
    'bankSource','read_only'
  );
end;
$$;

revoke all on function financial_app.store_document_ocr_run(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function financial_app.confirm_document_ocr_review(uuid,uuid,text,date,text,text,text,text,bigint,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function financial_app.document_ocr_history(uuid) from public, anon, authenticated;
grant execute on function financial_app.store_document_ocr_run(uuid,jsonb,jsonb) to service_role;
grant execute on function financial_app.confirm_document_ocr_review(uuid,uuid,text,date,text,text,text,text,bigint,bigint,bigint,text,text) to service_role;
grant execute on function financial_app.document_ocr_history(uuid) to service_role;
