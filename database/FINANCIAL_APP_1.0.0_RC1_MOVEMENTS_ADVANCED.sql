-- Financial App 1.0.0-rc.1
-- Auditoría: movimientos divididos con impacto financiero personal + búsqueda avanzada/OCR.
-- Aplicado previamente en Supabase mediante migraciones auditadas.

create or replace function financial_app.personal_financial_lines()
returns table(
  transaction_id uuid,movement_date date,amount numeric,category text,subcategory text,merchant text,movement_type text,
  account_id uuid,account_role text,cash_flow_enabled boolean,source_missing boolean,is_duplicate boolean,is_internal_transfer boolean,
  cash_flow_override boolean,needs_review boolean,status financial_app.transaction_status
)
language sql stable security definer set search_path='pg_catalog','financial_app'
as $$
  with base as (
    select t.*,coalesce(t.effective_date,t.source_date) d,
      coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría') effective_category,
      coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),'') effective_subcategory,
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte') effective_merchant,
      coalesce(nullif(t.type_override,''),nullif(t.source_transaction_type,''),'Sin tipo') effective_type,
      a.account_role,a.cash_flow_enabled,exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id) has_splits
    from financial_app.transactions t join financial_app.accounts a on a.id=t.account_id
  )
  select b.id,b.d,s.amount,coalesce(nullif(s.category,''),b.effective_category),coalesce(nullif(s.subcategory,''),b.effective_subcategory),
    b.effective_merchant,b.effective_type,b.account_id,b.account_role,b.cash_flow_enabled,b.source_missing,b.is_duplicate,b.is_internal_transfer,b.cash_flow_override,b.needs_review,b.status
  from base b join financial_app.transaction_splits s on s.transaction_id=b.id and s.is_personal=true where b.has_splits
  union all
  select b.id,b.d,coalesce(b.personal_amount_override,b.source_amount),b.effective_category,b.effective_subcategory,b.effective_merchant,b.effective_type,
    b.account_id,b.account_role,b.cash_flow_enabled,b.source_missing,b.is_duplicate,b.is_internal_transfer,b.cash_flow_override,b.needs_review,b.status
  from base b where not b.has_splits
$$;
revoke all on function financial_app.personal_financial_lines() from public,anon,authenticated;
grant execute on function financial_app.personal_financial_lines() to service_role;

create or replace function financial_app.replace_transaction_splits_core(p_transaction_id uuid,p_splits jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text;v_source_amount numeric;v_sum numeric:=0;v_personal_sum numeric:=0;v_item jsonb;v_amount numeric;v_before jsonb;v_after jsonb;v_count int:=0;v_old_personal numeric;
begin
  v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  if jsonb_typeof(p_splits) is distinct from 'array' then raise exception 'invalid_splits';end if;
  select source_amount,personal_amount_override into v_source_amount,v_old_personal from financial_app.transactions where id=p_transaction_id for update;
  if not found or v_source_amount is null then raise exception 'transaction_not_found' using errcode='P0002';end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into v_before from financial_app.transaction_splits s where s.transaction_id=p_transaction_id;
  for v_item in select value from jsonb_array_elements(p_splits) loop
    v_count:=v_count+1;if v_count>50 then raise exception 'too_many_splits';end if;
    begin v_amount:=(v_item->>'amount')::numeric;exception when others then raise exception 'invalid_split_amount';end;
    if v_amount is null or v_amount=0 then raise exception 'invalid_split_amount';end if;
    if sign(v_amount)<>sign(v_source_amount) then raise exception 'split_sign_mismatch';end if;
    v_sum:=v_sum+v_amount;if coalesce((v_item->>'isPersonal')::boolean,true) then v_personal_sum:=v_personal_sum+v_amount;end if;
  end loop;
  if v_count=1 then raise exception 'split_requires_two_parts';end if;
  if v_count>0 and abs(v_sum-v_source_amount)>.01 then raise exception 'split_total_mismatch: expected %, got %',v_source_amount,v_sum;end if;
  delete from financial_app.transaction_splits where transaction_id=p_transaction_id;
  if v_count>0 then
    insert into financial_app.transaction_splits(transaction_id,amount,category,subcategory,beneficiary,is_personal,notes)
    select p_transaction_id,(x->>'amount')::numeric,nullif(trim(x->>'category'),''),nullif(trim(x->>'subcategory'),''),nullif(trim(x->>'beneficiary'),''),coalesce((x->>'isPersonal')::boolean,true),nullif(trim(x->>'notes'),'') from jsonb_array_elements(p_splits)x;
  end if;
  update financial_app.transactions set personal_amount_override=case when v_count>0 then v_personal_sum else null end,updated_at=now() where id=p_transaction_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into v_after from financial_app.transaction_splits s where s.transaction_id=p_transaction_id;
  if v_before is distinct from v_after then insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by) values(p_transaction_id,'app.splits',to_jsonb(v_source_amount),v_before,v_after,'user_edit',v_email);end if;
  if v_old_personal is distinct from(case when v_count>0 then v_personal_sum else null end) then insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by) values(p_transaction_id,'app.personalAmount',to_jsonb(v_source_amount),to_jsonb(v_old_personal),to_jsonb(case when v_count>0 then v_personal_sum else null end),'user_edit',v_email);end if;
  return financial_app.transaction_splits_core(p_transaction_id);
end $$;
revoke all on function financial_app.replace_transaction_splits_core(uuid,jsonb) from public,anon;
grant execute on function financial_app.replace_transaction_splits_core(uuid,jsonb) to authenticated,service_role;

-- Búsqueda/filtros avanzados. Mantiene el RPC anterior para compatibilidad y añade un RPC nuevo.
create or replace function financial_app.movements_advanced_core(
 p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,p_max_amount numeric default null,p_sort text default 'date_desc')
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text;v_page int:=greatest(coalesce(p_page,1),1);v_page_size int:=least(greatest(coalesce(p_page_size,50),1),200);v_offset int;v_total bigint;v_items jsonb;v_facets jsonb;v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
 v_email:=financial_app.authorized_email();if v_email is null then raise exception 'forbidden' using errcode='42501';end if;v_offset:=(v_page-1)*v_page_size;
 with filtered as(
  select t.*,a.name account_name,a.external_identifier account_identifier,a.account_role,coalesce(t.effective_date,t.source_date) effective_date_value,
   coalesce(t.type_override,t.source_transaction_type) effective_type,coalesce(t.category_override,t.source_category) effective_category,coalesce(t.subcategory_override,t.source_subcategory) effective_subcategory,
   coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept) effective_concept,coalesce(t.counterparty_override,t.source_counterparty) effective_counterparty,
   exists(select 1 from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id where td.transaction_id=t.id and d.archived_at is null) has_documents,
   (select count(*) from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id where td.transaction_id=t.id and d.archived_at is null)::int document_count,
   exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id) has_splits
  from financial_app.transactions t left join financial_app.accounts a on a.id=t.account_id
  where (p_account_id is null or t.account_id=p_account_id)
   and (nullif(btrim(coalesce(p_type,'')),'') is null or coalesce(t.type_override,t.source_transaction_type)=p_type)
   and (nullif(btrim(coalesce(p_category,'')),'') is null or coalesce(t.category_override,t.source_category)=p_category)
   and (nullif(btrim(coalesce(p_subcategory,'')),'') is null or coalesce(t.subcategory_override,t.source_subcategory)=p_subcategory)
   and (nullif(btrim(coalesce(p_channel,'')),'') is null or coalesce(t.source_channel,'')=p_channel)
   and (nullif(btrim(coalesce(p_tag,'')),'') is null or p_tag=any(t.tags))
   and (not coalesce(p_review_only,false) or t.needs_review or t.status='review_source' or t.source_missing)
   and (p_recurring is null or coalesce(t.is_recurring,false)=p_recurring)
   and (p_internal_transfer is null or t.is_internal_transfer=p_internal_transfer)
   and (p_reconciled is null or coalesce(t.is_reconciled,false)=p_reconciled)
   and (p_has_documents is null or exists(select 1 from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id where td.transaction_id=t.id and d.archived_at is null)=p_has_documents)
   and (p_has_splits is null or exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id)=p_has_splits)
   and (p_date_from is null or coalesce(t.effective_date,t.source_date)>=p_date_from) and (p_date_to is null or coalesce(t.effective_date,t.source_date)<=p_date_to)
   and (p_min_amount is null or t.source_amount>=p_min_amount) and (p_max_amount is null or t.source_amount<=p_max_amount)
   and (v_search is null or to_tsvector('simple',coalesce(t.source_original_concept,'')||' '||coalesce(t.source_normalized_concept,'')||' '||coalesce(t.normalized_concept_override,'')||' '||coalesce(t.source_counterparty,'')||' '||coalesce(t.counterparty_override,'')||' '||coalesce(t.notes,'')||' '||coalesce(t.source_channel,'')||' '||array_to_string(t.tags,' ')) @@ websearch_to_tsquery('simple',v_search)
    or t.source_id ilike '%'||v_search||'%' or coalesce(t.source_identifier,'') ilike '%'||v_search||'%' or coalesce(t.source_amount::text,'') ilike '%'||replace(v_search,',','.')||'%'
    or exists(select 1 from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id where td.transaction_id=t.id and d.archived_at is null and(coalesce(d.file_name,'') ilike '%'||v_search||'%' or coalesce(d.merchant,'') ilike '%'||v_search||'%' or coalesce(d.notes,'') ilike '%'||v_search||'%' or coalesce(d.ocr_text,'') ilike '%'||v_search||'%')))
 ),counted as(
  select count(*) over() full_count,f.* from filtered f order by case when p_sort='date_asc' then effective_date_value end asc nulls last,case when p_sort='amount_desc' then source_amount end desc nulls last,case when p_sort='amount_asc' then source_amount end asc nulls last,case when p_sort not in('date_asc','amount_desc','amount_asc') then effective_date_value end desc nulls last,source_time desc nulls last,id desc limit v_page_size offset v_offset
 )
 select coalesce(max(full_count),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'date',effective_date_value,'sourceDate',source_date,'time',source_time,'account',jsonb_build_object('id',account_id,'name',account_name,'identifier',account_identifier,'role',account_role),'amount',source_amount,'personalAmount',personal_amount_override,'hasSplits',has_splits,'balance',source_balance,'type',effective_type,'sourceType',source_transaction_type,'category',effective_category,'sourceCategory',source_category,'subcategory',effective_subcategory,'sourceSubcategory',source_subcategory,'concept',effective_concept,'sourceOriginalConcept',source_original_concept,'sourceNormalizedConcept',source_normalized_concept,'counterparty',effective_counterparty,'sourceCounterparty',source_counterparty,'channel',source_channel,'status',status,'sourceMissing',source_missing,'needsReview',needs_review,'isInternalTransfer',is_internal_transfer,'isDuplicate',is_duplicate,'isReconciled',is_reconciled,'isRecurring',is_recurring,'cashFlowOverride',cash_flow_override,'tags',tags,'notes',notes,'hasDocuments',has_documents,'documentCount',document_count,'hasOverrides',(category_override is not null or subcategory_override is not null or type_override is not null or normalized_concept_override is not null or counterparty_override is not null or description_override is not null or effective_date is not null or cash_flow_override is not null or notes is not null or cardinality(tags)>0 or personal_amount_override is not null),'updatedAt',updated_at) order by case when p_sort='date_asc' then effective_date_value end asc nulls last,case when p_sort='amount_desc' then source_amount end desc nulls last,case when p_sort='amount_asc' then source_amount end asc nulls last,case when p_sort not in('date_asc','amount_desc','amount_asc') then effective_date_value end desc nulls last,source_time desc nulls last,id desc),'[]'::jsonb) into v_total,v_items from counted;
 select jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'identifier',a.external_identifier) order by a.name) from financial_app.accounts a where a.active=true),'[]'::jsonb),'types',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(type_override,source_transaction_type)value from financial_app.transactions where nullif(btrim(coalesce(type_override,source_transaction_type)),'') is not null)x),'[]'::jsonb),'categories',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(category_override,source_category)value from financial_app.transactions where nullif(btrim(coalesce(category_override,source_category)),'') is not null)x),'[]'::jsonb),'subcategories',coalesce((select jsonb_agg(value order by value) from(select distinct coalesce(subcategory_override,source_subcategory)value from financial_app.transactions where nullif(btrim(coalesce(subcategory_override,source_subcategory)),'') is not null)x),'[]'::jsonb),'channels',coalesce((select jsonb_agg(value order by value) from(select distinct source_channel value from financial_app.transactions where nullif(btrim(coalesce(source_channel,'')),'') is not null)x),'[]'::jsonb),'tags',coalesce((select jsonb_agg(value order by value) from(select distinct unnest(tags)value from financial_app.transactions)x where nullif(btrim(coalesce(value,'')),'') is not null),'[]'::jsonb)) into v_facets;
 return jsonb_build_object('ok',true,'version',financial_app.current_app_version(),'page',v_page,'pageSize',v_page_size,'total',v_total,'items',v_items,'facets',v_facets,'searchIncludesOcr',true);
end $$;
revoke all on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) from public,anon;
grant execute on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) to authenticated,service_role;

create or replace function public.financial_app_movements_advanced(p_page integer default 1,p_page_size integer default 50,p_search text default null,p_account_id uuid default null,p_type text default null,p_category text default null,p_subcategory text default null,p_channel text default null,p_tag text default null,p_review_only boolean default false,p_recurring boolean default null,p_internal_transfer boolean default null,p_reconciled boolean default null,p_has_documents boolean default null,p_has_splits boolean default null,p_date_from date default null,p_date_to date default null,p_min_amount numeric default null,p_max_amount numeric default null,p_sort text default 'date_desc')
returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.movements_advanced_core(p_page,p_page_size,p_search,p_account_id,p_type,p_category,p_subcategory,p_channel,p_tag,p_review_only,p_recurring,p_internal_transfer,p_reconciled,p_has_documents,p_has_splits,p_date_from,p_date_to,p_min_amount,p_max_amount,p_sort)$$;
revoke all on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) from public,anon;
grant execute on function public.financial_app_movements_advanced(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text) to authenticated,service_role;
