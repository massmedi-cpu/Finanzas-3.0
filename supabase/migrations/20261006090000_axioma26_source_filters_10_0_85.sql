-- Financial App 10.0.85 · Axioma §26 · filtros de fuente/documentos/recurrentes
-- Amplía el buscador sin modificar la fuente bancaria ni los registros originales.

create or replace function financial_app.query_effective_transactions_v3(
  p_query text default null::text,
  p_account_id uuid default null::uuid,
  p_category_id uuid default null::uuid,
  p_merchant_id uuid default null::uuid,
  p_kind text default null::text,
  p_review_state text default null::text,
  p_duplicate_state text default null::text,
  p_date_from date default null::date,
  p_date_to date default null::date,
  p_cursor_bank_date date default null::date,
  p_cursor_id uuid default null::uuid,
  p_limit integer default 50,
  p_uncategorized boolean default false,
  p_sign_mismatch boolean default false,
  p_amount_from_cents bigint default null::bigint,
  p_amount_to_cents bigint default null::bigint,
  p_channel text default null::text,
  p_counterparty text default null::text,
  p_reconciliation text default null::text,
  p_recurring boolean default false,
  p_internal_transfer boolean default false,
  p_has_document boolean default false,
  p_document_query text default null::text,
  p_split_label text default null::text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_limit integer := coalesce(p_limit,50);
begin
  if v_limit < 1 or v_limit > 100 then raise exception 'invalid_transaction_page_limit'; end if;
  if (p_cursor_bank_date is null) <> (p_cursor_id is null) then raise exception 'invalid_transaction_cursor'; end if;
  if p_kind is not null and p_kind not in ('income','expense','transfer','refund','adjustment') then raise exception 'invalid_transaction_kind_filter'; end if;
  if p_review_state is not null and p_review_state not in ('confirmed','pending','needs_review') then raise exception 'invalid_transaction_review_filter'; end if;
  if p_duplicate_state is not null and p_duplicate_state not in ('none','suspected','confirmed') then raise exception 'invalid_transaction_duplicate_filter'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then raise exception 'invalid_transaction_date_range'; end if;
  if p_amount_from_cents is not null and p_amount_to_cents is not null and p_amount_from_cents > p_amount_to_cents then raise exception 'invalid_transaction_amount_range'; end if;
  if pg_catalog.char_length(coalesce(p_channel,'')) > 120 then raise exception 'invalid_transaction_channel_filter'; end if;
  if pg_catalog.char_length(coalesce(p_counterparty,'')) > 200 then raise exception 'invalid_transaction_counterparty_filter'; end if;
  if pg_catalog.char_length(coalesce(p_reconciliation,'')) > 120 then raise exception 'invalid_transaction_reconciliation_filter'; end if;
  if pg_catalog.char_length(coalesce(p_document_query,'')) > 200 then raise exception 'invalid_transaction_document_filter'; end if;
  if pg_catalog.char_length(coalesce(p_split_label,'')) > 200 then raise exception 'invalid_transaction_split_label_filter'; end if;

  with effective_base as (
    select
      t.id,t.source_record_id,t.source_row_identity,t.account_id,a.name as account_name,t.bank_date,
      sr.concept_original,t.concept_normalized,coalesce(o.concept_override,t.concept_normalized) as effective_concept,
      t.merchant_id as original_merchant_id,f.effective_merchant_id,
      t.category_id as original_category_id,f.effective_category_id,
      t.kind as original_kind,f.effective_kind,t.amount_cents,t.balance_after_cents,
      t.review_state as original_review_state,coalesce(o.review_state_override,t.review_state) as effective_review_state,
      t.duplicate_state,t.transfer_pair_id,f.sign_mismatch,
      coalesce(o.excluded_from_analytics,false) as excluded_from_analytics,o.note as user_note,(o.id is not null) as has_user_override,
      coalesce(o.merchant_override_set,false) as merchant_override_set,coalesce(o.category_override_set,false) as category_override_set,
      o.merchant_id_override,o.category_id_override,o.concept_override,o.kind_override,o.review_state_override,
      sr.source_file_id,sr.source_sheet_id,sr.source_row_key,sr.source_fingerprint,sr.imported_at,sr.source_payload
    from financial_app.financial_transaction_facts(p_date_from,p_date_to,p_account_id) f
    join financial_app.transactions t on t.id=f.transaction_id
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    join financial_app.accounts a on a.id=t.account_id
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
  ), enriched as (
    select
      b.*,om.name as original_merchant_name,em.name as effective_merchant_name,
      financial_app.category_display_name(b.original_category_id) as original_category_name,
      financial_app.category_display_name(b.effective_category_id) as effective_category_name
    from effective_base b
    left join financial_app.merchants om on om.id=b.original_merchant_id
    left join financial_app.merchants em on em.id=b.effective_merchant_id
  ), filtered as (
    select * from enriched e
    where (p_account_id is null or e.account_id=p_account_id)
      and (
        p_category_id is null
        or (
          not exists (
            select 1
            from financial_app.transaction_split_allocations split_probe
            where split_probe.transaction_id=e.id
              and split_probe.source_amount_cents=e.amount_cents
          )
          and (
            e.effective_category_id=p_category_id
            or exists (
              select 1 from financial_app.categories fc
              where fc.id=e.effective_category_id and fc.parent_category_id=p_category_id
            )
          )
        )
        or exists (
          select 1
          from financial_app.transaction_split_allocations split_category
          where split_category.transaction_id=e.id
            and split_category.source_amount_cents=e.amount_cents
            and split_category.allocation_scope='personal'
            and (
              coalesce(split_category.category_id,
                case
                  when e.category_override_set then e.category_id_override
                  else coalesce(e.category_id_override,e.original_category_id)
                end
              )=p_category_id
              or exists (
                select 1
                from financial_app.categories split_parent
                where split_parent.id=coalesce(split_category.category_id,
                  case
                    when e.category_override_set then e.category_id_override
                    else coalesce(e.category_id_override,e.original_category_id)
                  end
                )
                  and split_parent.parent_category_id=p_category_id
              )
            )
        )
      )
      and (
        not coalesce(p_uncategorized,false)
        or (
          not exists (
            select 1
            from financial_app.transaction_split_allocations split_probe
            where split_probe.transaction_id=e.id
              and split_probe.source_amount_cents=e.amount_cents
          )
          and e.effective_category_id is null
        )
        or exists (
          select 1
          from financial_app.transaction_split_allocations split_uncategorized
          where split_uncategorized.transaction_id=e.id
            and split_uncategorized.source_amount_cents=e.amount_cents
            and split_uncategorized.allocation_scope='personal'
            and coalesce(split_uncategorized.category_id,
              case
                when e.category_override_set then e.category_id_override
                else coalesce(e.category_id_override,e.original_category_id)
              end
            ) is null
        )
      )
      and (not coalesce(p_sign_mismatch,false) or e.sign_mismatch)
      and (p_merchant_id is null or e.effective_merchant_id=p_merchant_id)
      and (p_kind is null or e.effective_kind=p_kind)
      and (p_review_state is null or e.effective_review_state=p_review_state)
      and (p_duplicate_state is null or e.duplicate_state=p_duplicate_state)
      and (p_date_from is null or e.bank_date>=p_date_from)
      and (p_date_to is null or e.bank_date<=p_date_to)
      and (p_amount_from_cents is null or e.amount_cents>=p_amount_from_cents)
      and (p_amount_to_cents is null or e.amount_cents<=p_amount_to_cents)
      and (
        nullif(pg_catalog.btrim(coalesce(p_channel,'')),'') is null
        or financial_app.normalize_merchant_label(coalesce(e.source_payload->>'Canal',''))
          = financial_app.normalize_merchant_label(pg_catalog.btrim(p_channel))
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_counterparty,'')),'') is null
        or financial_app.normalize_merchant_label(coalesce(e.source_payload->>'Comercio o contraparte',''))
          like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_counterparty)) || '%'
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_reconciliation,'')),'') is null
        or financial_app.normalize_merchant_label(coalesce(e.source_payload->>'Conciliado',''))
          = financial_app.normalize_merchant_label(pg_catalog.btrim(p_reconciliation))
      )
      and (
        not coalesce(p_recurring,false)
        or exists (
          select 1 from financial_app.forecast_items fi
          where fi.confirmed_transaction_id=e.id
            and fi.recurrence_id is not null
            and not coalesce(fi.excluded,false)
        )
      )
      and (
        not coalesce(p_internal_transfer,false)
        or e.transfer_pair_id is not null
        or financial_app.normalize_merchant_label(coalesce(e.source_payload->>'Canal',''))
          = financial_app.normalize_merchant_label('Transferencia interna')
      )
      and (
        not coalesce(p_has_document,false)
        or exists (
          select 1 from financial_app.document_transaction_associations da
          where da.transaction_id=e.id and da.confirmed=true
        )
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_document_query,'')),'') is null
        or exists (
          select 1
          from financial_app.document_transaction_associations da
          join financial_app.documents d on d.id=da.document_id
          where da.transaction_id=e.id
            and da.confirmed=true
            and financial_app.normalize_merchant_label(concat_ws(' ',d.original_file_name,d.issuer_name,d.notes,d.type,d.status))
              like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_document_query)) || '%'
        )
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_split_label,'')),'') is null
        or exists (
          select 1 from financial_app.transaction_split_allocations sa
          where sa.transaction_id=e.id
            and sa.source_amount_cents=e.amount_cents
            and nullif(pg_catalog.btrim(coalesce(sa.label,'')),'') is not null
            and financial_app.normalize_merchant_label(sa.label)
              like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_split_label)) || '%'
        )
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_query,'')),'') is null
        or financial_app.normalize_merchant_label(concat_ws(' ',e.effective_concept,e.concept_original,e.account_name,e.effective_merchant_name,e.effective_category_name,e.user_note,e.source_row_key,e.source_sheet_id,e.source_file_id,e.source_payload->>'Canal',e.source_payload->>'Comercio o contraparte',e.source_payload->>'Subcategoría',e.source_payload->>'Conciliado'))
          like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_query)) || '%'
      )
  ), after_cursor as (
    select * from filtered f
    where p_cursor_bank_date is null or (f.bank_date,f.id)<(p_cursor_bank_date,p_cursor_id)
    order by f.bank_date desc,f.id desc
    limit v_limit+1
  ), visible as (
    select * from after_cursor order by bank_date desc,id desc limit v_limit
  ), stats as (
    select
      (select count(*)::int from filtered) as total_count,
      (select count(*)::int from after_cursor)>v_limit as has_more
  ), last_visible as (
    select bank_date,id from visible order by bank_date asc,id asc limit 1
  ), rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,'bankDate',v.bank_date,'amountCents',v.amount_cents,'balanceAfterCents',v.balance_after_cents,
      'account',jsonb_build_object('id',v.account_id,'name',v.account_name),
      'concept',jsonb_build_object('original',v.concept_original,'processed',v.concept_normalized,'effective',v.effective_concept),
      'merchant',jsonb_build_object('originalId',v.original_merchant_id,'originalName',v.original_merchant_name,'effectiveId',v.effective_merchant_id,'effectiveName',v.effective_merchant_name),
      'category',jsonb_build_object('originalId',v.original_category_id,'originalName',v.original_category_name,'effectiveId',v.effective_category_id,'effectiveName',v.effective_category_name),
      'kind',jsonb_build_object('original',v.original_kind,'effective',v.effective_kind),
      'reviewState',jsonb_build_object('original',v.original_review_state,'effective',v.effective_review_state),
      'duplicateState',v.duplicate_state,'signMismatch',v.sign_mismatch,'transferPairId',v.transfer_pair_id,
      'excludedFromAnalytics',v.excluded_from_analytics,'userNote',v.user_note,'hasUserOverride',v.has_user_override,
      'overriddenFields',to_jsonb(array_remove(array[
        case when v.concept_override is not null then 'concept' end,
        case when v.merchant_override_set or v.merchant_id_override is not null then 'merchant' end,
        case when v.category_override_set or v.category_id_override is not null then 'category' end,
        case when v.kind_override is not null then 'kind' end,
        case when v.review_state_override is not null then 'reviewState' end,
        case when v.excluded_from_analytics then 'excludedFromAnalytics' end,
        case when v.user_note is not null then 'note' end
      ]::text[],null)),
      'source',jsonb_build_object(
        'sourceRecordId',v.source_record_id,'sourceRowIdentity',v.source_row_identity,'sourceFileId',v.source_file_id,
        'sourceSheetId',v.source_sheet_id,'sourceRowKey',v.source_row_key,'sourceFingerprint',v.source_fingerprint,'importedAt',v.imported_at,
        'channel',v.source_payload->>'Canal','counterparty',v.source_payload->>'Comercio o contraparte',
        'reconciliation',v.source_payload->>'Conciliado','sourceSubcategory',v.source_payload->>'Subcategoría'
      )
    ) order by v.bank_date desc,v.id desc),'[]'::jsonb) as rows
    from visible v
  )
  select jsonb_build_object(
    'rows',r.rows,
    'totalCount',s.total_count,
    'hasMore',s.has_more,
    'nextCursor',case when s.has_more and l.id is not null then jsonb_build_object('bankDate',l.bank_date,'id',l.id) else null end
  )
  into v_result
  from stats s
  cross join rows_json r
  left join last_visible l on true;

  return v_result;
end;
$$;

revoke all on function financial_app.query_effective_transactions_v3(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean,boolean,bigint,bigint,text,text,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function financial_app.query_effective_transactions_v3(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean,boolean,bigint,bigint,text,text,text,boolean,boolean,boolean,text,text) to financial_app_gateway;
grant execute on function financial_app.query_effective_transactions_v3(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean,boolean,bigint,bigint,text,text,text,boolean,boolean,boolean,text,text) to service_role;

comment on function financial_app.query_effective_transactions_v3(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean,boolean,bigint,bigint,text,text,text,boolean,boolean,boolean,text,text) is
'Axioma §26 tramo 2: canal, contraparte, conciliación, recurrente confirmado, transferencia interna, documento asociado, metadatos de documento y etiqueta de reparto; fuente bancaria solo lectura.';

update financial_app.schema_meta set updated_at=now() where id=true;
