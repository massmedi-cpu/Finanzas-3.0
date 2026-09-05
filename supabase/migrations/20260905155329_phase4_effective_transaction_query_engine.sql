begin;

create index if not exists transactions_bank_date_id_idx
  on financial_app.transactions (bank_date desc, id desc);
create index if not exists transactions_account_date_idx
  on financial_app.transactions (account_id, bank_date desc, id);
create index if not exists transactions_category_date_idx
  on financial_app.transactions (category_id, bank_date desc);
create index if not exists transactions_merchant_date_idx
  on financial_app.transactions (merchant_id, bank_date desc, id desc);
create index if not exists transactions_kind_date_idx
  on financial_app.transactions (kind, bank_date desc, id desc);
create index if not exists transactions_review_idx
  on financial_app.transactions (review_state, bank_date desc);
create index if not exists transactions_duplicate_idx
  on financial_app.transactions (duplicate_state, bank_date desc);

create or replace function financial_app.query_effective_transactions(
  p_query text default null,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_merchant_id uuid default null,
  p_kind text default null,
  p_review_state text default null,
  p_duplicate_state text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_cursor_bank_date date default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_limit integer := coalesce(p_limit, 50);
begin
  if v_limit < 1 or v_limit > 100 then
    raise exception 'invalid_transaction_page_limit';
  end if;
  if (p_cursor_bank_date is null) <> (p_cursor_id is null) then
    raise exception 'invalid_transaction_cursor';
  end if;
  if p_kind is not null and p_kind not in ('income','expense','transfer','refund','adjustment') then
    raise exception 'invalid_transaction_kind_filter';
  end if;
  if p_review_state is not null and p_review_state not in ('confirmed','pending','needs_review') then
    raise exception 'invalid_transaction_review_filter';
  end if;
  if p_duplicate_state is not null and p_duplicate_state not in ('none','suspected','confirmed') then
    raise exception 'invalid_transaction_duplicate_filter';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'invalid_transaction_date_range';
  end if;

  with effective_base as (
    select
      t.id,
      t.source_record_id,
      t.source_row_identity,
      t.account_id,
      a.name as account_name,
      t.bank_date,
      sr.concept_original,
      t.concept_normalized,
      coalesce(o.concept_override, t.concept_normalized) as effective_concept,
      t.merchant_id as original_merchant_id,
      case
        when o.id is null then t.merchant_id
        when coalesce(o.merchant_override_set, false) then o.merchant_id_override
        else coalesce(o.merchant_id_override, t.merchant_id)
      end as effective_merchant_id,
      t.category_id as original_category_id,
      case
        when o.id is null then t.category_id
        when coalesce(o.category_override_set, false) then o.category_id_override
        else coalesce(o.category_id_override, t.category_id)
      end as effective_category_id,
      t.kind as original_kind,
      coalesce(o.kind_override, t.kind) as effective_kind,
      t.amount_cents,
      t.balance_after_cents,
      t.review_state as original_review_state,
      coalesce(o.review_state_override, t.review_state) as effective_review_state,
      t.duplicate_state,
      t.transfer_pair_id,
      coalesce(o.excluded_from_analytics, false) as excluded_from_analytics,
      o.note as user_note,
      (o.id is not null) as has_user_override,
      coalesce(o.merchant_override_set, false) as merchant_override_set,
      coalesce(o.category_override_set, false) as category_override_set,
      o.merchant_id_override,
      o.category_id_override,
      o.concept_override,
      o.kind_override,
      o.review_state_override,
      sr.source_file_id,
      sr.source_sheet_id,
      sr.source_row_key,
      sr.source_fingerprint,
      sr.imported_at
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id = t.source_record_id
    join financial_app.accounts a on a.id = t.account_id
    left join financial_app.transaction_overrides o on o.transaction_id = t.id
  ), enriched as (
    select
      b.*,
      om.name as original_merchant_name,
      em.name as effective_merchant_name,
      oc.name as original_category_name,
      ec.name as effective_category_name
    from effective_base b
    left join financial_app.merchants om on om.id = b.original_merchant_id
    left join financial_app.merchants em on em.id = b.effective_merchant_id
    left join financial_app.categories oc on oc.id = b.original_category_id
    left join financial_app.categories ec on ec.id = b.effective_category_id
  ), filtered as (
    select *
    from enriched e
    where (p_account_id is null or e.account_id = p_account_id)
      and (p_category_id is null or e.effective_category_id = p_category_id)
      and (p_merchant_id is null or e.effective_merchant_id = p_merchant_id)
      and (p_kind is null or e.effective_kind = p_kind)
      and (p_review_state is null or e.effective_review_state = p_review_state)
      and (p_duplicate_state is null or e.duplicate_state = p_duplicate_state)
      and (p_date_from is null or e.bank_date >= p_date_from)
      and (p_date_to is null or e.bank_date <= p_date_to)
      and (
        nullif(pg_catalog.btrim(coalesce(p_query, '')), '') is null
        or financial_app.normalize_merchant_label(
             concat_ws(' ',
               e.effective_concept,
               e.concept_original,
               e.account_name,
               e.effective_merchant_name,
               e.effective_category_name
             )
           ) like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_query)) || '%'
      )
  ), after_cursor as (
    select *
    from filtered f
    where p_cursor_bank_date is null
       or (f.bank_date, f.id) < (p_cursor_bank_date, p_cursor_id)
    order by f.bank_date desc, f.id desc
    limit v_limit + 1
  ), visible as (
    select *
    from after_cursor
    order by bank_date desc, id desc
    limit v_limit
  ), stats as (
    select
      (select count(*)::int from filtered) as total_count,
      (select count(*)::int from after_cursor) > v_limit as has_more
  ), last_visible as (
    select bank_date, id
    from visible
    order by bank_date asc, id asc
    limit 1
  ), rows_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'bankDate', v.bank_date,
          'amountCents', v.amount_cents,
          'balanceAfterCents', v.balance_after_cents,
          'account', jsonb_build_object('id', v.account_id, 'name', v.account_name),
          'concept', jsonb_build_object(
            'original', v.concept_original,
            'processed', v.concept_normalized,
            'effective', v.effective_concept
          ),
          'merchant', jsonb_build_object(
            'originalId', v.original_merchant_id,
            'originalName', v.original_merchant_name,
            'effectiveId', v.effective_merchant_id,
            'effectiveName', v.effective_merchant_name
          ),
          'category', jsonb_build_object(
            'originalId', v.original_category_id,
            'originalName', v.original_category_name,
            'effectiveId', v.effective_category_id,
            'effectiveName', v.effective_category_name
          ),
          'kind', jsonb_build_object('original', v.original_kind, 'effective', v.effective_kind),
          'reviewState', jsonb_build_object('original', v.original_review_state, 'effective', v.effective_review_state),
          'duplicateState', v.duplicate_state,
          'transferPairId', v.transfer_pair_id,
          'excludedFromAnalytics', v.excluded_from_analytics,
          'userNote', v.user_note,
          'hasUserOverride', v.has_user_override,
          'overriddenFields', to_jsonb(array_remove(array[
            case when v.concept_override is not null then 'concept' end,
            case when v.merchant_override_set or v.merchant_id_override is not null then 'merchant' end,
            case when v.category_override_set or v.category_id_override is not null then 'category' end,
            case when v.kind_override is not null then 'kind' end,
            case when v.review_state_override is not null then 'reviewState' end,
            case when v.excluded_from_analytics then 'excludedFromAnalytics' end,
            case when v.user_note is not null then 'note' end
          ]::text[], null)),
          'source', jsonb_build_object(
            'sourceRecordId', v.source_record_id,
            'sourceRowIdentity', v.source_row_identity,
            'sourceFileId', v.source_file_id,
            'sourceSheetId', v.source_sheet_id,
            'sourceRowKey', v.source_row_key,
            'sourceFingerprint', v.source_fingerprint,
            'importedAt', v.imported_at
          )
        )
        order by v.bank_date desc, v.id desc
      ),
      '[]'::jsonb
    ) as rows
    from visible v
  )
  select jsonb_build_object(
    'rows', r.rows,
    'totalCount', s.total_count,
    'hasMore', s.has_more,
    'nextCursor', case
      when s.has_more and l.id is not null
        then jsonb_build_object('bankDate', l.bank_date, 'id', l.id)
      else null
    end
  )
  into v_result
  from stats s
  cross join rows_json r
  left join last_visible l on true;

  return v_result;
end;
$$;

revoke all on function financial_app.query_effective_transactions(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer)
  from public,anon,authenticated;
grant execute on function financial_app.query_effective_transactions(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer)
  to service_role;

update financial_app.schema_meta
set schema_version=10,updated_at=now()
where id=true;

commit;
