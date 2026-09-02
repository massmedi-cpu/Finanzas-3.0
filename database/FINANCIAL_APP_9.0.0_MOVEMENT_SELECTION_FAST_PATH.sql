-- Financial App 9.0.0 · lightweight movement selection fast path
-- Returns only ordered transaction ids + total for bulk-selection UX.
-- Semantic filters intentionally mirror movements_advanced_core without building
-- movement cards, facets, document metadata or split summaries.

create or replace function financial_app.movements_selection_core(
  p_limit integer default 200,
  p_search text default null,
  p_account_id uuid default null,
  p_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_channel text default null,
  p_tag text default null,
  p_review_only boolean default false,
  p_recurring boolean default null,
  p_internal_transfer boolean default null,
  p_reconciled boolean default null,
  p_has_documents boolean default null,
  p_has_splits boolean default null,
  p_date_from date default null,
  p_date_to date default null,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_sort text default 'date_desc',
  p_merchant text default null,
  p_cash_flow_only boolean default false,
  p_duplicate boolean default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'financial_app', 'auth'
as $function$
declare
  v_email text;
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 200);
  v_total bigint := 0;
  v_ids jsonb := '[]'::jsonb;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  v_email := financial_app.authorized_email();
  if v_email is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with matching as materialized (
    select
      t.id,
      coalesce(t.effective_date, t.source_date) as effective_date_value,
      t.source_amount,
      t.source_time
    from financial_app.transactions t
    left join financial_app.accounts a on a.id = t.account_id
    where (p_account_id is null or t.account_id = p_account_id)
      and (nullif(btrim(coalesce(p_type, '')), '') is null or coalesce(t.type_override, t.source_transaction_type) = p_type)
      and (nullif(btrim(coalesce(p_category, '')), '') is null or coalesce(t.category_override, t.source_category) = p_category)
      and (nullif(btrim(coalesce(p_subcategory, '')), '') is null or coalesce(t.subcategory_override, t.source_subcategory) = p_subcategory)
      and (nullif(btrim(coalesce(p_merchant, '')), '') is null or coalesce(nullif(t.counterparty_override, ''), nullif(t.source_counterparty, ''), nullif(t.normalized_concept_override, ''), nullif(t.source_normalized_concept, ''), nullif(t.source_original_concept, ''), 'Sin contraparte') = p_merchant)
      and (nullif(btrim(coalesce(p_channel, '')), '') is null or coalesce(t.source_channel, '') = p_channel)
      and (nullif(btrim(coalesce(p_tag, '')), '') is null or p_tag = any(t.tags))
      and (not coalesce(p_review_only, false) or t.needs_review or t.status = 'review_source' or t.source_missing)
      and (p_recurring is null or coalesce(t.is_recurring, false) = p_recurring)
      and (p_internal_transfer is null or t.is_internal_transfer = p_internal_transfer)
      and (p_duplicate is null or t.is_duplicate = p_duplicate)
      and (
        p_reconciled is null
        or (p_reconciled = true and financial_app.effective_reconciliation_status(t) = 'reconciled')
        or (p_reconciled = false and financial_app.effective_reconciliation_status(t) in ('pending', 'not_reconciled'))
      )
      and (
        p_has_documents is null
        or exists (
          select 1
          from financial_app.transaction_documents td
          join financial_app.documents d on d.id = td.document_id
          where td.transaction_id = t.id and d.archived_at is null
        ) = p_has_documents
      )
      and (
        p_has_splits is null
        or exists (select 1 from financial_app.transaction_splits s where s.transaction_id = t.id) = p_has_splits
      )
      and (p_date_from is null or coalesce(t.effective_date, t.source_date) >= p_date_from)
      and (p_date_to is null or coalesce(t.effective_date, t.source_date) <= p_date_to)
      and (p_min_amount is null or t.source_amount >= p_min_amount)
      and (p_max_amount is null or t.source_amount <= p_max_amount)
      and (
        not coalesce(p_cash_flow_only, false)
        or (
          t.source_missing = false
          and t.is_duplicate = false
          and t.is_internal_transfer = false
          and coalesce(a.account_role, '') <> 'savings'
          and coalesce(a.cash_flow_enabled, false) = true
          and t.cash_flow_override is distinct from false
          and (
            not exists (select 1 from financial_app.transaction_splits s where s.transaction_id = t.id)
            or exists (select 1 from financial_app.transaction_splits s where s.transaction_id = t.id and s.is_personal = true)
          )
        )
      )
      and (
        v_search is null
        or t.search_vector @@ websearch_to_tsquery('simple', v_search)
        or t.source_id ilike '%' || v_search || '%'
        or coalesce(t.source_identifier, '') ilike '%' || v_search || '%'
        or coalesce(t.source_amount::text, '') ilike '%' || replace(v_search, ',', '.') || '%'
        or exists (
          select 1
          from financial_app.transaction_documents td
          join financial_app.documents d on d.id = td.document_id
          where td.transaction_id = t.id
            and d.archived_at is null
            and (
              coalesce(d.file_name, '') ilike '%' || v_search || '%'
              or coalesce(d.merchant, '') ilike '%' || v_search || '%'
              or coalesce(d.notes, '') ilike '%' || v_search || '%'
              or coalesce(d.ocr_text, '') ilike '%' || v_search || '%'
            )
        )
      )
  ), selected as (
    select m.*
    from matching m
    order by
      case when p_sort = 'date_asc' then m.effective_date_value end asc nulls last,
      case when p_sort = 'amount_desc' then m.source_amount end desc nulls last,
      case when p_sort = 'amount_asc' then m.source_amount end asc nulls last,
      case when p_sort not in ('date_asc', 'amount_desc', 'amount_asc') then m.effective_date_value end desc nulls last,
      m.source_time desc nulls last,
      m.id desc
    limit v_limit
  )
  select
    (select count(*) from matching),
    coalesce((
      select jsonb_agg(s.id order by
        case when p_sort = 'date_asc' then s.effective_date_value end asc nulls last,
        case when p_sort = 'amount_desc' then s.source_amount end desc nulls last,
        case when p_sort = 'amount_asc' then s.source_amount end asc nulls last,
        case when p_sort not in ('date_asc', 'amount_desc', 'amount_asc') then s.effective_date_value end desc nulls last,
        s.source_time desc nulls last,
        s.id desc)
      from selected s
    ), '[]'::jsonb)
  into v_total, v_ids;

  return jsonb_build_object(
    'ok', true,
    'version', financial_app.current_app_version(),
    'ids', v_ids,
    'total', v_total,
    'limit', v_limit,
    'truncated', v_total > jsonb_array_length(v_ids)
  );
end
$function$;

create or replace function public.financial_app_movements_selection(
  p_limit integer default 200,
  p_search text default null,
  p_account_id uuid default null,
  p_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_channel text default null,
  p_tag text default null,
  p_review_only boolean default false,
  p_recurring boolean default null,
  p_internal_transfer boolean default null,
  p_reconciled boolean default null,
  p_has_documents boolean default null,
  p_has_splits boolean default null,
  p_date_from date default null,
  p_date_to date default null,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_sort text default 'date_desc',
  p_merchant text default null,
  p_cash_flow_only boolean default false,
  p_duplicate boolean default null
) returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'financial_app', 'auth'
as $function$
  select financial_app.movements_selection_core(
    p_limit, p_search, p_account_id, p_type, p_category, p_subcategory,
    p_channel, p_tag, p_review_only, p_recurring, p_internal_transfer,
    p_reconciled, p_has_documents, p_has_splits, p_date_from, p_date_to,
    p_min_amount, p_max_amount, p_sort, p_merchant, p_cash_flow_only, p_duplicate
  );
$function$;

revoke all on function financial_app.movements_selection_core(integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from public, anon;
revoke all on function public.financial_app_movements_selection(integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from public, anon;
grant execute on function financial_app.movements_selection_core(integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated, service_role;
grant execute on function public.financial_app_movements_selection(integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated, service_role;

comment on function public.financial_app_movements_selection(integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean)
is 'Financial App 9.0.0 lightweight ordered id selection for safe bulk movement operations.';
