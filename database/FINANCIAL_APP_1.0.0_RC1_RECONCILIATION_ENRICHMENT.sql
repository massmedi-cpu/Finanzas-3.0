-- FINANCIAL APP · 1.0.0-rc.1
-- Enriquecimiento de Movimientos con estado efectivo de conciliación y contrapartida.

create or replace function financial_app.movements_advanced_enriched_core(
  p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,p_max_amount numeric default null,p_sort text default 'date_desc'
) returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_base jsonb; v_items jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_base:=financial_app.movements_advanced_core(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_subcategory,p_channel,p_tag,p_review_only,p_recurring,p_internal_transfer,p_reconciled,p_has_documents,p_has_splits,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort);
  select coalesce(jsonb_agg(i.item||jsonb_build_object('reconciliationStatus',financial_app.effective_reconciliation_status(t),'sourceReconciled',t.source_reconciled,'isReconciled',financial_app.effective_reconciliation_status(t)='reconciled','reconciledByApp',t.is_reconciled is true) order by i.ord),'[]'::jsonb)
  into v_items from jsonb_array_elements(v_base->'items') with ordinality i(item,ord) join financial_app.transactions t on t.id=(i.item->>'id')::uuid;
  return jsonb_set(v_base,'{items}',v_items,true);
end $$;
revoke all on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) from public,anon;
grant execute on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) to authenticated,service_role;

create or replace function financial_app.transaction_detail_enriched_core(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_base jsonb; v_rec jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_base:=financial_app.transaction_detail_rpc(p_transaction_id);
  v_rec:=financial_app.transaction_reconciliation_core(p_transaction_id);
  return jsonb_set(v_base,'{transaction,reconciliation}',v_rec,true);
end $$;
revoke all on function financial_app.transaction_detail_enriched_core(uuid) from public,anon;
grant execute on function financial_app.transaction_detail_enriched_core(uuid) to authenticated,service_role;

create or replace function public.financial_app_movements_advanced(
  p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,p_max_amount numeric default null,p_sort text default 'date_desc'
) returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.movements_advanced_enriched_core(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_subcategory,p_channel,p_tag,p_review_only,p_recurring,p_internal_transfer,p_reconciled,p_has_documents,p_has_splits,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort)$$;
revoke all on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) from public,anon;
grant execute on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) to authenticated,service_role;

create or replace function public.financial_app_transaction_detail(p_transaction_id uuid)
returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.transaction_detail_enriched_core(p_transaction_id)$$;
revoke all on function public.financial_app_transaction_detail(uuid) from public,anon;
grant execute on function public.financial_app_transaction_detail(uuid) to authenticated,service_role;
