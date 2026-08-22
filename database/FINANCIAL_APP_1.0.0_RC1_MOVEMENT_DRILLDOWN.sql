-- Financial App 1.0.0-rc.1
-- Movimientos: drill-down URL, comercio exacto, reglas Cash Flow y paginación optimizada.
-- Validación al aplicar: las firmas JSON públicas se conservaron exactamente y la consulta
-- general bajó a ~40 ms sin bloques temporales en el dataset actual.

-- Elimina únicamente las firmas antiguas de 20 argumentos para evitar sobrecargas ambiguas.
drop function if exists public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text);
drop function if exists financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text);
drop function if exists financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text);

create or replace function financial_app.movements_advanced_core(
 p_page integer default 1,
 p_page_size integer default 50,
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
 p_cash_flow_only boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
 v_email text;
 v_page int:=greatest(coalesce(p_page,1),1);
 v_page_size int:=least(greatest(coalesce(p_page_size,50),1),200);
 v_offset int;
 v_total bigint:=0;
 v_items jsonb:='[]'::jsonb;
 v_facets jsonb;
 v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
 v_email:=financial_app.authorized_email();
 if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
 v_offset:=(v_page-1)*v_page_size;

 -- Primero se filtran/ordenan únicamente IDs y claves de ordenación. El detalle ancho se
 -- carga después de paginar para no arrastrar source_payload ni provocar spill a disco.
 with matching as materialized (
   select
     t.id,
     coalesce(t.effective_date,t.source_date) as effective_date_value,
     t.source_amount,
     t.source_time
   from financial_app.transactions t
   left join financial_app.accounts a on a.id=t.account_id
   where (p_account_id is null or t.account_id=p_account_id)
     and (nullif(btrim(coalesce(p_type,'')),'') is null or coalesce(t.type_override,t.source_transaction_type)=p_type)
     and (nullif(btrim(coalesce(p_category,'')),'') is null or coalesce(t.category_override,t.source_category)=p_category)
     and (nullif(btrim(coalesce(p_subcategory,'')),'') is null or coalesce(t.subcategory_override,t.source_subcategory)=p_subcategory)
     and (nullif(btrim(coalesce(p_merchant,'')),'') is null or coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte')=p_merchant)
     and (nullif(btrim(coalesce(p_channel,'')),'') is null or coalesce(t.source_channel,'')=p_channel)
     and (nullif(btrim(coalesce(p_tag,'')),'') is null or p_tag=any(t.tags))
     and (not coalesce(p_review_only,false) or t.needs_review or t.status='review_source' or t.source_missing)
     and (p_recurring is null or coalesce(t.is_recurring,false)=p_recurring)
     and (p_internal_transfer is null or t.is_internal_transfer=p_internal_transfer)
     and (p_reconciled is null or (p_reconciled=true and financial_app.effective_reconciliation_status(t)='reconciled') or (p_reconciled=false and financial_app.effective_reconciliation_status(t) in ('pending','not_reconciled')))
     and (p_has_documents is null or exists(select 1 from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id where td.transaction_id=t.id and d.archived_at is null)=p_has_documents)
     and (p_has_splits is null or exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id)=p_has_splits)
     and (p_date_from is null or coalesce(t.effective_date,t.source_date)>=p_date_from)
     and (p_date_to is null or coalesce(t.effective_date,t.source_date)<=p_date_to)
     and (p_min_amount is null or t.source_amount>=p_min_amount)
     and (p_max_amount is null or t.source_amount<=p_max_amount)
     and (not coalesce(p_cash_flow_only,false) or (
       t.source_missing=false
       and t.is_duplicate=false
       and t.is_internal_transfer=false
       and coalesce(a.account_role,'')<>'savings'
       and coalesce(a.cash_flow_enabled,false)=true
       and t.cash_flow_override is distinct from false
       and (
         not exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id)
         or exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id and s.is_personal=true)
       )
     ))
     and (v_search is null
       or to_tsvector('simple',coalesce(t.source_original_concept,'')||' '||coalesce(t.source_normalized_concept,'')||' '||coalesce(t.normalized_concept_override,'')||' '||coalesce(t.source_counterparty,'')||' '||coalesce(t.counterparty_override,'')||' '||coalesce(t.notes,'')||' '||coalesce(t.source_channel,'')||' '||array_to_string(t.tags,' ')) @@ websearch_to_tsquery('simple',v_search)
       or t.source_id ilike '%'||v_search||'%'
       or coalesce(t.source_identifier,'') ilike '%'||v_search||'%'
       or coalesce(t.source_amount::text,'') ilike '%'||replace(v_search,',','.')||'%'
       or exists(
         select 1
         from financial_app.transaction_documents td
         join financial_app.documents d on d.id=td.document_id
         where td.transaction_id=t.id and d.archived_at is null
           and (coalesce(d.file_name,'') ilike '%'||v_search||'%' or coalesce(d.merchant,'') ilike '%'||v_search||'%' or coalesce(d.notes,'') ilike '%'||v_search||'%' or coalesce(d.ocr_text,'') ilike '%'||v_search||'%')
       )
     )
 ),
 paged as materialized (
   select m.*
   from matching m
   order by
     case when p_sort='date_asc' then m.effective_date_value end asc nulls last,
     case when p_sort='amount_desc' then m.source_amount end desc nulls last,
     case when p_sort='amount_asc' then m.source_amount end asc nulls last,
     case when p_sort not in('date_asc','amount_desc','amount_asc') then m.effective_date_value end desc nulls last,
     m.source_time desc nulls last,m.id desc
   limit v_page_size offset v_offset
 ),
 page_rows as materialized (
   select
     p.effective_date_value,
     t.id,t.source_id,t.source_date,t.source_time,t.account_id,t.source_amount,t.source_balance,
     t.source_transaction_type,t.source_category,t.source_subcategory,t.source_original_concept,
     t.source_normalized_concept,t.source_counterparty,t.source_channel,t.source_reconciled,t.status,
     t.source_missing,t.needs_review,t.is_internal_transfer,t.is_duplicate,t.is_recurring,t.cash_flow_override,
     t.tags,t.notes,t.updated_at,t.category_override,t.subcategory_override,t.type_override,
     t.normalized_concept_override,t.counterparty_override,t.description_override,t.effective_date,
     t.personal_amount_override,t.is_reconciled,
     a.name as account_name,a.external_identifier as account_identifier,a.account_role,
     coalesce(t.type_override,t.source_transaction_type) as effective_type,
     coalesce(t.category_override,t.source_category) as effective_category,
     coalesce(t.subcategory_override,t.source_subcategory) as effective_subcategory,
     coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept) as effective_concept,
     coalesce(t.counterparty_override,t.source_counterparty) as effective_counterparty,
     financial_app.effective_reconciliation_status(t) as reconciliation_status,
     coalesce(ds.document_count,0)::int as document_count,
     coalesce(ds.document_count,0)>0 as has_documents,
     coalesce(ss.split_count,0)>0 as has_splits,
     case when coalesce(ss.split_count,0)>0 then coalesce(ss.personal_amount,0) else coalesce(t.personal_amount_override,t.source_amount) end as personal_amount_value,
     (t.category_override is not null or t.subcategory_override is not null or t.type_override is not null or t.normalized_concept_override is not null or t.counterparty_override is not null or t.description_override is not null or t.effective_date is not null or t.cash_flow_override is not null or t.notes is not null or cardinality(t.tags)>0 or t.personal_amount_override is not null or t.is_reconciled is not null) as has_overrides
   from paged p
   join financial_app.transactions t on t.id=p.id
   left join financial_app.accounts a on a.id=t.account_id
   left join lateral (
     select count(*)::int as document_count
     from financial_app.transaction_documents td
     join financial_app.documents d on d.id=td.document_id
     where td.transaction_id=t.id and d.archived_at is null
   ) ds on true
   left join lateral (
     select count(*)::int as split_count,
            coalesce(sum(s.amount) filter(where s.is_personal=true),0)::numeric as personal_amount
     from financial_app.transaction_splits s
     where s.transaction_id=t.id
   ) ss on true
 )
 select (select count(*) from matching),
        coalesce(jsonb_agg(jsonb_build_object(
          'id',id,'sourceId',source_id,'date',effective_date_value,'sourceDate',source_date,'time',source_time,
          'account',jsonb_build_object('id',account_id,'name',account_name,'identifier',account_identifier,'role',account_role),
          'amount',source_amount,'personalAmount',personal_amount_value,'hasSplits',has_splits,'balance',source_balance,
          'type',effective_type,'sourceType',source_transaction_type,'category',effective_category,'sourceCategory',source_category,
          'subcategory',effective_subcategory,'sourceSubcategory',source_subcategory,'concept',effective_concept,
          'sourceOriginalConcept',source_original_concept,'sourceNormalizedConcept',source_normalized_concept,
          'counterparty',effective_counterparty,'sourceCounterparty',source_counterparty,'channel',source_channel,
          'status',status,'sourceMissing',source_missing,'needsReview',needs_review,'isInternalTransfer',is_internal_transfer,
          'isDuplicate',is_duplicate,
          'isReconciled',case when reconciliation_status='reconciled' then true when reconciliation_status in('pending','not_reconciled') then false else null end,
          'reconciliationStatus',reconciliation_status,'sourceReconciled',source_reconciled,'isRecurring',is_recurring,
          'cashFlowOverride',cash_flow_override,'tags',tags,'notes',notes,'hasDocuments',has_documents,
          'documentCount',document_count,'hasOverrides',has_overrides,'updatedAt',updated_at
        ) order by
          case when p_sort='date_asc' then effective_date_value end asc nulls last,
          case when p_sort='amount_desc' then source_amount end desc nulls last,
          case when p_sort='amount_asc' then source_amount end asc nulls last,
          case when p_sort not in('date_asc','amount_desc','amount_asc') then effective_date_value end desc nulls last,
          source_time desc nulls last,id desc),'[]'::jsonb)
 into v_total,v_items
 from page_rows;

 select jsonb_build_object(
   'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'identifier',a.external_identifier) order by a.name) from financial_app.accounts a where a.active=true),'[]'::jsonb),
   'types',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(type_override,source_transaction_type) value from financial_app.transactions where nullif(btrim(coalesce(type_override,source_transaction_type)), '') is not null)x),'[]'::jsonb),
   'categories',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(category_override,source_category) value from financial_app.transactions where nullif(btrim(coalesce(category_override,source_category)), '') is not null)x),'[]'::jsonb),
   'subcategories',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(subcategory_override,source_subcategory) value from financial_app.transactions where nullif(btrim(coalesce(subcategory_override,source_subcategory)), '') is not null)x),'[]'::jsonb),
   'merchants',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(nullif(counterparty_override,''),nullif(source_counterparty,''),nullif(normalized_concept_override,''),nullif(source_normalized_concept,''),nullif(source_original_concept,''),'Sin contraparte') value from financial_app.transactions)x),'[]'::jsonb),
   'channels',coalesce((select jsonb_agg(value order by value) from(select distinct source_channel value from financial_app.transactions where nullif(btrim(coalesce(source_channel,'')), '') is not null)x),'[]'::jsonb),
   'tags',coalesce((select jsonb_agg(value order by value) from(select distinct unnest(tags) value from financial_app.transactions)x where nullif(btrim(coalesce(value,'')),'') is not null),'[]'::jsonb)
 ) into v_facets;

 return jsonb_build_object(
   'ok',true,'version',financial_app.current_app_version(),'page',v_page,'pageSize',v_page_size,
   'total',v_total,'items',v_items,'facets',v_facets,'searchIncludesOcr',true,
   'reconciliationSemantics','effective','cashFlowFilterApplied',coalesce(p_cash_flow_only,false)
 );
end
$function$;

create or replace function financial_app.movements_advanced_enriched_core(
 p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,
 p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,
 p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,
 p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,
 p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,
 p_max_amount numeric default null,p_sort text default 'date_desc',p_merchant text default null,p_cash_flow_only boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text; v_base jsonb; v_items jsonb;
begin
 v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
 v_base:=financial_app.movements_advanced_core(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_subcategory,p_channel,p_tag,p_review_only,p_recurring,p_internal_transfer,p_reconciled,p_has_documents,p_has_splits,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort,p_merchant,p_cash_flow_only);
 select coalesce(jsonb_agg(
   i.item || jsonb_build_object(
     'reconciliationStatus',financial_app.effective_reconciliation_status(t),
     'sourceReconciled',t.source_reconciled,
     'isReconciled',financial_app.effective_reconciliation_status(t)='reconciled',
     'reconciledByApp',t.is_reconciled is true
   ) order by i.ord
 ),'[]'::jsonb) into v_items
 from jsonb_array_elements(v_base->'items') with ordinality i(item,ord)
 join financial_app.transactions t on t.id=(i.item->>'id')::uuid;
 return jsonb_set(v_base,'{items}',v_items,true);
end
$function$;

create or replace function public.financial_app_movements_advanced(
 p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,
 p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,
 p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,
 p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,
 p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,
 p_max_amount numeric default null,p_sort text default 'date_desc',p_merchant text default null,p_cash_flow_only boolean default false
) returns jsonb
language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$
 select financial_app.movements_advanced_enriched_core(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_subcategory,p_channel,p_tag,p_review_only,p_recurring,p_internal_transfer,p_reconciled,p_has_documents,p_has_splits,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort,p_merchant,p_cash_flow_only)
$function$;

revoke all on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) from public,anon;
revoke all on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) from public,anon;
revoke all on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) from public,anon;

grant execute on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) to authenticated,service_role;
grant execute on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) to authenticated,service_role;
grant execute on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean) to authenticated,service_role;
