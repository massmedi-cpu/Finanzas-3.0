-- Financial App 1.8.0 · preservar estado privado de movimientos añadidos después del backup
-- Hotfix de seguridad funcional sobre restore_portable_backup_core().

create or replace function financial_app.restore_portable_backup_core(
  p_backup jsonb,
  p_expected_fingerprint text,
  p_confirmation text
)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_preview jsonb;
  v_fingerprint text;
  v_checkpoint_payload jsonb;
  v_checkpoint_id uuid;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_confirmation is distinct from 'RESTAURAR' then raise exception 'restore_confirmation_required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext('financial_app:private_restore'));
  lock table financial_app.transactions in share row exclusive mode;

  v_preview:=financial_app.backup_preview_core(p_backup);
  if not coalesce((v_preview->>'safe')::boolean,false) then
    raise exception 'backup_not_safe:%',coalesce((v_preview->'errors')::text,'[]') using errcode='22023';
  end if;
  v_fingerprint:=v_preview->>'backupFingerprint';
  if nullif(btrim(coalesce(p_expected_fingerprint,'')),'') is null
     or v_fingerprint is distinct from lower(btrim(p_expected_fingerprint)) then
    raise exception 'backup_fingerprint_mismatch' using errcode='22023';
  end if;

  v_checkpoint_payload:=financial_app.portable_backup_core();
  insert into financial_app.private_backup_checkpoints(created_by,reason,payload_fingerprint,payload)
  values(v_email,'pre_restore:'||left(v_fingerprint,12),md5(v_checkpoint_payload::text),v_checkpoint_payload)
  returning id into v_checkpoint_id;

  -- Solo se revierten overrides de movimientos que ya existían cuando se creó la copia.
  update financial_app.transactions t
  set category_override=null,
      subcategory_override=null,
      type_override=null,
      normalized_concept_override=null,
      counterparty_override=null,
      description_override=null,
      effective_date=null,
      cash_flow_override=null,
      is_internal_transfer=false,
      is_duplicate=false,
      is_reconciled=null,
      needs_review=false,
      is_recurring=null,
      tags=array[]::text[],
      notes=null,
      personal_amount_override=null,
      updated_at=now()
  where exists(
          select 1
          from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
          where a.value->>'sourceId'=t.source_id
        )
    and (
      category_override is not null
      or subcategory_override is not null
      or type_override is not null
      or normalized_concept_override is not null
      or counterparty_override is not null
      or description_override is not null
      or effective_date is not null
      or cash_flow_override is not null
      or is_internal_transfer
      or is_duplicate
      or is_reconciled is not null
      or needs_review
      or is_recurring is not null
      or cardinality(tags)>0
      or notes is not null
      or personal_amount_override is not null
    );

  update financial_app.transactions t
  set category_override=x."categoryOverride",
      subcategory_override=x."subcategoryOverride",
      type_override=x."typeOverride",
      normalized_concept_override=x."normalizedConceptOverride",
      counterparty_override=x."counterpartyOverride",
      description_override=x."descriptionOverride",
      effective_date=x."effectiveDate",
      cash_flow_override=x."cashFlowOverride",
      is_internal_transfer=coalesce(x."isInternalTransfer",false),
      is_duplicate=coalesce(x."isDuplicate",false),
      is_reconciled=x."isReconciled",
      needs_review=coalesce(x."needsReview",false),
      is_recurring=x."isRecurring",
      tags=coalesce(x.tags,array[]::text[]),
      notes=x.notes,
      personal_amount_override=x."personalAmountOverride",
      updated_at=now()
  from jsonb_to_recordset(financial_app.backup_array(p_backup,'transactionOverrides')) as x(
    "sourceId" text,
    "categoryOverride" text,
    "subcategoryOverride" text,
    "typeOverride" text,
    "normalizedConceptOverride" text,
    "counterpartyOverride" text,
    "descriptionOverride" text,
    "effectiveDate" date,
    "cashFlowOverride" boolean,
    "isInternalTransfer" boolean,
    "isDuplicate" boolean,
    "isReconciled" boolean,
    "needsReview" boolean,
    "isRecurring" boolean,
    tags text[],
    notes text,
    "personalAmountOverride" numeric
  )
  where t.source_id=x."sourceId";

  perform financial_app.backup_upsert_table_core('financial_app.budgets'::regclass,financial_app.backup_array(p_backup,'budgets'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.forecasts'::regclass,financial_app.backup_array(p_backup,'forecasts'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.net_worth_items'::regclass,financial_app.backup_array(p_backup,'netWorthItems'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.goals'::regclass,financial_app.backup_array(p_backup,'goals'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_rules'::regclass,financial_app.backup_array(p_backup,'rules'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.preferences'::regclass,financial_app.backup_array(p_backup,'preferences'),array['user_email']);
  perform financial_app.backup_upsert_table_core('financial_app.control_alert_states'::regclass,financial_app.backup_array(p_backup,'controlAlertStates'),array['alert_key']);
  perform financial_app.backup_upsert_table_core('financial_app.month_closes'::regclass,financial_app.backup_array(p_backup,'monthCloses'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.documents'::regclass,financial_app.backup_array(p_backup,'documents'),array['id'],array['ocr_text']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_splits'::regclass,financial_app.backup_array(p_backup,'splits'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.reconciliation_pairs'::regclass,financial_app.backup_array(p_backup,'reconciliationPairs'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.forecast_occurrences'::regclass,financial_app.backup_array(p_backup,'forecastOccurrences'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_documents'::regclass,financial_app.backup_array(p_backup,'transactionDocuments'),array['transaction_id','document_id']);

  -- Los hijos directos se reconcilian solo para movimientos que pertenecían al snapshot.
  delete from financial_app.transaction_documents td
  using financial_app.transactions t
  where t.id=td.transaction_id
    and exists(
      select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
      where a.value->>'sourceId'=t.source_id
    )
    and not exists(
      select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionDocuments')) e(value)
      where e.value->>'transaction_id'=td.transaction_id::text
        and e.value->>'document_id'=td.document_id::text
    );

  delete from financial_app.transaction_splits s
  using financial_app.transactions t
  where t.id=s.transaction_id
    and exists(
      select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
      where a.value->>'sourceId'=t.source_id
    )
    and not exists(
      select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'splits')) e(value)
      where e.value->>'id'=s.id::text
    );

  delete from financial_app.forecast_occurrences o
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'forecastOccurrences')) e(value)
    where e.value->>'id'=o.id::text
  );
  delete from financial_app.control_alert_states s
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'controlAlertStates')) e(value)
    where e.value->>'alert_key'=s.alert_key
  );
  delete from financial_app.month_closes c
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'monthCloses')) e(value)
    where e.value->>'id'=c.id::text
  );

  update financial_app.budgets b set active=false,updated_at=now()
  where b.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'budgets'))e(value) where e.value->>'id'=b.id::text);
  update financial_app.forecasts f set status='cancelled',updated_at=now()
  where f.status<>'cancelled' and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'forecasts'))e(value) where e.value->>'id'=f.id::text);
  update financial_app.net_worth_items n set active=false,updated_at=now()
  where n.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'netWorthItems'))e(value) where e.value->>'id'=n.id::text);
  update financial_app.goals g set active=false,updated_at=now()
  where g.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'goals'))e(value) where e.value->>'id'=g.id::text);
  update financial_app.transaction_rules r set active=false,updated_at=now()
  where r.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'rules'))e(value) where e.value->>'id'=r.id::text);

  -- Una conciliación que toca un movimiento posterior se conserva.
  update financial_app.reconciliation_pairs r
  set status='cancelled',cancelled_by=v_email,cancelled_at=coalesce(cancelled_at,now())
  where r.status<>'cancelled'
    and exists(
      select 1 from financial_app.transactions ta
      where ta.id=r.transaction_a_id
        and exists(
          select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
          where a.value->>'sourceId'=ta.source_id
        )
    )
    and exists(
      select 1 from financial_app.transactions tb
      where tb.id=r.transaction_b_id
        and exists(
          select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
          where a.value->>'sourceId'=tb.source_id
        )
    )
    and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'reconciliationPairs'))e(value) where e.value->>'id'=r.id::text);

  -- Un documento posterior vinculado a un movimiento posterior permanece activo.
  update financial_app.documents d set archived_at=coalesce(d.archived_at,now()),updated_at=now()
  where d.archived_at is null
    and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'documents'))e(value) where e.value->>'id'=d.id::text)
    and not exists(
      select 1
      from financial_app.transaction_documents td
      join financial_app.transactions t on t.id=td.transaction_id
      where td.document_id=d.id
        and not exists(
          select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
          where a.value->>'sourceId'=t.source_id
        )
    );

  delete from financial_app.private_backup_checkpoints
  where id in (
    select id from financial_app.private_backup_checkpoints
    order by created_at desc,id desc
    offset 10
  );

  return jsonb_build_object(
    'ok',true,
    'restored',true,
    'checkpointId',v_checkpoint_id,
    'backupFingerprint',v_fingerprint,
    'version',financial_app.current_app_version(),
    'source',v_preview->'source',
    'sections',v_preview->'sections'
  );
end
$$;

notify pgrst,'reload schema';
