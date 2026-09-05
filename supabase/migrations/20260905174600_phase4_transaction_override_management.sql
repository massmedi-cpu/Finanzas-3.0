begin;

drop function if exists financial_app.query_effective_transactions(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer);

create or replace function financial_app.apply_transaction_override_patch(
  p_transaction_ids uuid[],
  p_patch jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_requested integer;
  v_existing integer;
  v_unknown_key text;
  v_transaction_id uuid;
  v_old financial_app.transaction_overrides%rowtype;
  v_had_old boolean;
  v_concept text;
  v_merchant_set boolean;
  v_merchant_id uuid;
  v_category_set boolean;
  v_category_id uuid;
  v_kind text;
  v_excluded boolean;
  v_review text;
  v_note text;
  v_changed_this boolean;
  v_changed integer := 0;
  v_audit integer := 0;
  v_mode text;
begin
  if p_transaction_ids is null or cardinality(p_transaction_ids) < 1 or cardinality(p_transaction_ids) > 200 then
    raise exception 'invalid_transaction_ids';
  end if;
  if array_position(p_transaction_ids, null) is not null then raise exception 'invalid_transaction_ids'; end if;

  select array_agg(x order by x), count(*)::int
  into v_ids, v_requested
  from (select distinct unnest(p_transaction_ids) as x) d;
  if v_requested <> cardinality(p_transaction_ids) then raise exception 'duplicate_transaction_ids'; end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'invalid_transaction_patch';
  end if;
  select key into v_unknown_key
  from jsonb_object_keys(p_patch) as key
  where key not in ('concept','merchantMode','merchantId','categoryMode','categoryId','kind','reviewState','excludedFromAnalytics','note')
  limit 1;
  if v_unknown_key is not null then raise exception 'unsupported_transaction_patch_field_%', v_unknown_key; end if;

  if p_patch ? 'concept' then
    if p_patch->'concept' <> 'null'::jsonb and jsonb_typeof(p_patch->'concept') <> 'string' then raise exception 'invalid_transaction_concept'; end if;
    if p_patch->'concept' <> 'null'::jsonb and (length(pg_catalog.btrim(p_patch->>'concept')) < 1 or length(pg_catalog.btrim(p_patch->>'concept')) > 240) then
      raise exception 'invalid_transaction_concept';
    end if;
  end if;

  if p_patch ? 'merchantId' and not (p_patch ? 'merchantMode') then raise exception 'transaction_merchant_mode_required'; end if;
  if p_patch ? 'merchantMode' then
    if jsonb_typeof(p_patch->'merchantMode') <> 'string' or p_patch->>'merchantMode' not in ('inherit','set') then raise exception 'invalid_transaction_merchant_mode'; end if;
    if p_patch->>'merchantMode' = 'inherit' and p_patch ? 'merchantId' and p_patch->'merchantId' <> 'null'::jsonb then raise exception 'transaction_merchant_inherit_with_id'; end if;
    if p_patch->>'merchantMode' = 'set' and p_patch ? 'merchantId' and p_patch->'merchantId' <> 'null'::jsonb then
      if jsonb_typeof(p_patch->'merchantId') <> 'string' or (p_patch->>'merchantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_transaction_merchant_id'; end if;
      if not exists (select 1 from financial_app.merchants where id=(p_patch->>'merchantId')::uuid) then raise exception 'transaction_merchant_not_found'; end if;
    end if;
  end if;

  if p_patch ? 'categoryId' and not (p_patch ? 'categoryMode') then raise exception 'transaction_category_mode_required'; end if;
  if p_patch ? 'categoryMode' then
    if jsonb_typeof(p_patch->'categoryMode') <> 'string' or p_patch->>'categoryMode' not in ('inherit','set') then raise exception 'invalid_transaction_category_mode'; end if;
    if p_patch->>'categoryMode' = 'inherit' and p_patch ? 'categoryId' and p_patch->'categoryId' <> 'null'::jsonb then raise exception 'transaction_category_inherit_with_id'; end if;
    if p_patch->>'categoryMode' = 'set' and p_patch ? 'categoryId' and p_patch->'categoryId' <> 'null'::jsonb then
      if jsonb_typeof(p_patch->'categoryId') <> 'string' or (p_patch->>'categoryId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid_transaction_category_id'; end if;
      if not exists (select 1 from financial_app.categories where id=(p_patch->>'categoryId')::uuid) then raise exception 'transaction_category_not_found'; end if;
    end if;
  end if;

  if p_patch ? 'kind' and p_patch->'kind' <> 'null'::jsonb and (jsonb_typeof(p_patch->'kind') <> 'string' or p_patch->>'kind' not in ('income','expense','transfer','refund','adjustment')) then
    raise exception 'invalid_transaction_kind_override';
  end if;
  if p_patch ? 'reviewState' and p_patch->'reviewState' <> 'null'::jsonb and (jsonb_typeof(p_patch->'reviewState') <> 'string' or p_patch->>'reviewState' not in ('confirmed','pending','needs_review')) then
    raise exception 'invalid_transaction_review_override';
  end if;
  if p_patch ? 'excludedFromAnalytics' and jsonb_typeof(p_patch->'excludedFromAnalytics') <> 'boolean' then raise exception 'invalid_transaction_excluded_override'; end if;
  if p_patch ? 'note' then
    if p_patch->'note' <> 'null'::jsonb and jsonb_typeof(p_patch->'note') <> 'string' then raise exception 'invalid_transaction_note'; end if;
    if p_patch->'note' <> 'null'::jsonb and length(p_patch->>'note') > 2000 then raise exception 'invalid_transaction_note'; end if;
  end if;

  select count(*)::int into v_existing from financial_app.transactions where id = any(v_ids);
  if v_existing <> v_requested then raise exception 'transaction_not_found'; end if;

  foreach v_transaction_id in array v_ids loop
    select * into v_old from financial_app.transaction_overrides where transaction_id=v_transaction_id for update;
    v_had_old := found;
    v_concept := case when v_had_old then v_old.concept_override else null end;
    v_merchant_set := case when v_had_old then coalesce(v_old.merchant_override_set,false) else false end;
    v_merchant_id := case when v_had_old then v_old.merchant_id_override else null end;
    v_category_set := case when v_had_old then coalesce(v_old.category_override_set,false) else false end;
    v_category_id := case when v_had_old then v_old.category_id_override else null end;
    v_kind := case when v_had_old then v_old.kind_override else null end;
    v_excluded := case when v_had_old then coalesce(v_old.excluded_from_analytics,false) else false end;
    v_review := case when v_had_old then v_old.review_state_override else null end;
    v_note := case when v_had_old then v_old.note else null end;

    if p_patch ? 'concept' then v_concept := case when p_patch->'concept'='null'::jsonb then null else pg_catalog.btrim(p_patch->>'concept') end; end if;
    if p_patch ? 'merchantMode' then
      v_mode := p_patch->>'merchantMode';
      if v_mode='inherit' then v_merchant_set:=false; v_merchant_id:=null;
      else v_merchant_set:=true; v_merchant_id:=case when not (p_patch ? 'merchantId') or p_patch->'merchantId'='null'::jsonb then null else (p_patch->>'merchantId')::uuid end;
      end if;
    end if;
    if p_patch ? 'categoryMode' then
      v_mode := p_patch->>'categoryMode';
      if v_mode='inherit' then v_category_set:=false; v_category_id:=null;
      else v_category_set:=true; v_category_id:=case when not (p_patch ? 'categoryId') or p_patch->'categoryId'='null'::jsonb then null else (p_patch->>'categoryId')::uuid end;
      end if;
    end if;
    if p_patch ? 'kind' then v_kind := case when p_patch->'kind'='null'::jsonb then null else p_patch->>'kind' end; end if;
    if p_patch ? 'reviewState' then v_review := case when p_patch->'reviewState'='null'::jsonb then null else p_patch->>'reviewState' end; end if;
    if p_patch ? 'excludedFromAnalytics' then v_excluded := (p_patch->>'excludedFromAnalytics')::boolean; end if;
    if p_patch ? 'note' then v_note := case when p_patch->'note'='null'::jsonb then null else nullif(pg_catalog.btrim(p_patch->>'note'),'') end; end if;

    v_changed_this := false;
    if (case when v_had_old then v_old.concept_override else null end) is distinct from v_concept then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'concept_override',to_jsonb(case when v_had_old then v_old.concept_override else null end),to_jsonb(v_concept),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then coalesce(v_old.merchant_override_set,false) else false end) is distinct from v_merchant_set or (case when v_had_old then v_old.merchant_id_override else null end) is distinct from v_merchant_id then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'merchant_override',jsonb_build_object('mode',case when v_had_old and coalesce(v_old.merchant_override_set,false) then 'set' else 'inherit' end,'id',case when v_had_old then v_old.merchant_id_override else null end),jsonb_build_object('mode',case when v_merchant_set then 'set' else 'inherit' end,'id',v_merchant_id),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then coalesce(v_old.category_override_set,false) else false end) is distinct from v_category_set or (case when v_had_old then v_old.category_id_override else null end) is distinct from v_category_id then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'category_override',jsonb_build_object('mode',case when v_had_old and coalesce(v_old.category_override_set,false) then 'set' else 'inherit' end,'id',case when v_had_old then v_old.category_id_override else null end),jsonb_build_object('mode',case when v_category_set then 'set' else 'inherit' end,'id',v_category_id),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then v_old.kind_override else null end) is distinct from v_kind then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'kind_override',to_jsonb(case when v_had_old then v_old.kind_override else null end),to_jsonb(v_kind),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then v_old.review_state_override else null end) is distinct from v_review then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'review_state_override',to_jsonb(case when v_had_old then v_old.review_state_override else null end),to_jsonb(v_review),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then coalesce(v_old.excluded_from_analytics,false) else false end) is distinct from v_excluded then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'excluded_from_analytics',to_jsonb(case when v_had_old then coalesce(v_old.excluded_from_analytics,false) else false end),to_jsonb(v_excluded),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;
    if (case when v_had_old then v_old.note else null end) is distinct from v_note then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values ('transaction',v_transaction_id,'note',to_jsonb(case when v_had_old then v_old.note else null end),to_jsonb(v_note),'user');
      v_audit:=v_audit+1; v_changed_this:=true;
    end if;

    if v_changed_this then
      v_changed:=v_changed+1;
      if v_concept is null and not v_merchant_set and v_merchant_id is null and not v_category_set and v_category_id is null and v_kind is null and not v_excluded and v_review is null and v_note is null then
        delete from financial_app.transaction_overrides where transaction_id=v_transaction_id;
      else
        insert into financial_app.transaction_overrides(transaction_id,concept_override,merchant_id_override,merchant_override_set,category_id_override,category_override_set,kind_override,excluded_from_analytics,review_state_override,note)
        values (v_transaction_id,v_concept,v_merchant_id,v_merchant_set,v_category_id,v_category_set,v_kind,v_excluded,v_review,v_note)
        on conflict(transaction_id) do update set concept_override=excluded.concept_override,merchant_id_override=excluded.merchant_id_override,merchant_override_set=excluded.merchant_override_set,category_id_override=excluded.category_id_override,category_override_set=excluded.category_override_set,kind_override=excluded.kind_override,excluded_from_analytics=excluded.excluded_from_analytics,review_state_override=excluded.review_state_override,note=excluded.note;
      end if;
    end if;
  end loop;

  return jsonb_build_object('requestedTransactions',v_requested,'changedTransactions',v_changed,'auditChanges',v_audit);
end;
$$;

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
  p_limit integer default 50,
  p_uncategorized boolean default false
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

  with effective_base as (
    select t.id,t.source_record_id,t.source_row_identity,t.account_id,a.name as account_name,t.bank_date,sr.concept_original,t.concept_normalized,
      coalesce(o.concept_override,t.concept_normalized) as effective_concept,
      t.merchant_id as original_merchant_id,
      case when o.id is null then t.merchant_id when coalesce(o.merchant_override_set,false) then o.merchant_id_override else coalesce(o.merchant_id_override,t.merchant_id) end as effective_merchant_id,
      t.category_id as original_category_id,
      case when o.id is null then t.category_id when coalesce(o.category_override_set,false) then o.category_id_override else coalesce(o.category_id_override,t.category_id) end as effective_category_id,
      t.kind as original_kind,coalesce(o.kind_override,t.kind) as effective_kind,t.amount_cents,t.balance_after_cents,
      t.review_state as original_review_state,coalesce(o.review_state_override,t.review_state) as effective_review_state,t.duplicate_state,t.transfer_pair_id,
      coalesce(o.excluded_from_analytics,false) as excluded_from_analytics,o.note as user_note,(o.id is not null) as has_user_override,
      coalesce(o.merchant_override_set,false) as merchant_override_set,coalesce(o.category_override_set,false) as category_override_set,
      o.merchant_id_override,o.category_id_override,o.concept_override,o.kind_override,o.review_state_override,
      sr.source_file_id,sr.source_sheet_id,sr.source_row_key,sr.source_fingerprint,sr.imported_at
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    join financial_app.accounts a on a.id=t.account_id
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
  ), enriched as (
    select b.*,om.name as original_merchant_name,em.name as effective_merchant_name,oc.name as original_category_name,ec.name as effective_category_name
    from effective_base b
    left join financial_app.merchants om on om.id=b.original_merchant_id
    left join financial_app.merchants em on em.id=b.effective_merchant_id
    left join financial_app.categories oc on oc.id=b.original_category_id
    left join financial_app.categories ec on ec.id=b.effective_category_id
  ), filtered as (
    select * from enriched e
    where (p_account_id is null or e.account_id=p_account_id)
      and (p_category_id is null or e.effective_category_id=p_category_id)
      and (not coalesce(p_uncategorized,false) or e.effective_category_id is null)
      and (p_merchant_id is null or e.effective_merchant_id=p_merchant_id)
      and (p_kind is null or e.effective_kind=p_kind)
      and (p_review_state is null or e.effective_review_state=p_review_state)
      and (p_duplicate_state is null or e.duplicate_state=p_duplicate_state)
      and (p_date_from is null or e.bank_date>=p_date_from)
      and (p_date_to is null or e.bank_date<=p_date_to)
      and (nullif(pg_catalog.btrim(coalesce(p_query,'')),'') is null or financial_app.normalize_merchant_label(concat_ws(' ',e.effective_concept,e.concept_original,e.account_name,e.effective_merchant_name,e.effective_category_name)) like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_query)) || '%')
  ), after_cursor as (
    select * from filtered f where p_cursor_bank_date is null or (f.bank_date,f.id)<(p_cursor_bank_date,p_cursor_id)
    order by f.bank_date desc,f.id desc limit v_limit+1
  ), visible as (
    select * from after_cursor order by bank_date desc,id desc limit v_limit
  ), stats as (
    select (select count(*)::int from filtered) as total_count,(select count(*)::int from after_cursor)>v_limit as has_more
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
      'duplicateState',v.duplicate_state,'transferPairId',v.transfer_pair_id,'excludedFromAnalytics',v.excluded_from_analytics,'userNote',v.user_note,'hasUserOverride',v.has_user_override,
      'overriddenFields',to_jsonb(array_remove(array[
        case when v.concept_override is not null then 'concept' end,
        case when v.merchant_override_set or v.merchant_id_override is not null then 'merchant' end,
        case when v.category_override_set or v.category_id_override is not null then 'category' end,
        case when v.kind_override is not null then 'kind' end,
        case when v.review_state_override is not null then 'reviewState' end,
        case when v.excluded_from_analytics then 'excludedFromAnalytics' end,
        case when v.user_note is not null then 'note' end
      ]::text[],null)),
      'source',jsonb_build_object('sourceRecordId',v.source_record_id,'sourceRowIdentity',v.source_row_identity,'sourceFileId',v.source_file_id,'sourceSheetId',v.source_sheet_id,'sourceRowKey',v.source_row_key,'sourceFingerprint',v.source_fingerprint,'importedAt',v.imported_at)
    ) order by v.bank_date desc,v.id desc),'[]'::jsonb) as rows from visible v
  )
  select jsonb_build_object('rows',r.rows,'totalCount',s.total_count,'hasMore',s.has_more,'nextCursor',case when s.has_more and l.id is not null then jsonb_build_object('bankDate',l.bank_date,'id',l.id) else null end)
  into v_result from stats s cross join rows_json r left join last_visible l on true;
  return v_result;
end;
$$;

revoke all on function financial_app.apply_transaction_override_patch(uuid[],jsonb) from public,anon,authenticated;
grant execute on function financial_app.apply_transaction_override_patch(uuid[],jsonb) to service_role;
revoke all on function financial_app.query_effective_transactions(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function financial_app.query_effective_transactions(text,uuid,uuid,uuid,text,text,text,date,date,date,uuid,integer,boolean) to service_role;

update financial_app.schema_meta set schema_version=11,updated_at=now() where id=true;

commit;
