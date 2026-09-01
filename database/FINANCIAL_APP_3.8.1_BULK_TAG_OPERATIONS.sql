begin;

-- Financial App 3.8.1 — operaciones masivas aditivas de etiquetas.
-- Extiende el RPC canónico de lote sin cambiar su firma pública ni romper
-- los lotes existentes. $tags se resuelve por movimiento antes de delegar
-- en update_transaction_rpc, por lo que historial y undo siguen siendo canónicos.

create or replace function financial_app.bulk_update_transactions_rpc(
  p_transaction_ids uuid[],
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_ids uuid[];
  v_id uuid;
  v_count int;
  v_batch_id uuid:=gen_random_uuid();
  v_before financial_app.transactions%rowtype;
  v_after_updated_at timestamptz;
  v_before_patch jsonb;
  v_base_patch jsonb;
  v_item_patch jsonb;
  v_tag_operation jsonb;
  v_tag_mode text;
  v_tag_values text[]:=array[]::text[];
  v_next_tags text[];
  v_special_key text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then raise exception 'invalid_patch'; end if;

  for v_special_key in select jsonb_object_keys(p_patch) loop
    if left(v_special_key,1)='$' and v_special_key<>'$tags' then
      raise exception 'unsupported_bulk_operation: %',v_special_key;
    end if;
  end loop;

  if p_patch?'$tags' and p_patch?'tags' then
    raise exception 'conflicting_tag_operations';
  end if;

  v_tag_operation:=p_patch->'$tags';
  v_base_patch:=p_patch-'$tags';

  if v_tag_operation is not null then
    if jsonb_typeof(v_tag_operation) is distinct from 'object' then raise exception 'invalid_tag_operation'; end if;
    v_tag_mode:=lower(btrim(coalesce(v_tag_operation->>'mode','')));
    if v_tag_mode not in ('add','remove') then raise exception 'invalid_tag_operation'; end if;
    if jsonb_typeof(v_tag_operation->'values') is distinct from 'array' then raise exception 'invalid_tag_operation'; end if;

    select coalesce(array_agg(value order by first_position),array[]::text[])
    into v_tag_values
    from (
      select btrim(value) as value,min(ordinality) as first_position
      from jsonb_array_elements_text(v_tag_operation->'values') with ordinality as e(value,ordinality)
      where btrim(value)<>''
      group by btrim(value)
    ) q;

    if cardinality(v_tag_values)=0 or cardinality(v_tag_values)>20 then raise exception 'invalid_tag_operation'; end if;
    if exists(select 1 from unnest(v_tag_values) value where length(value)>48) then raise exception 'invalid_tag_operation'; end if;
  end if;

  if v_base_patch='{}'::jsonb and v_tag_operation is null then raise exception 'invalid_patch'; end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (select distinct id from unnest(coalesce(p_transaction_ids,array[]::uuid[])) id where id is not null) q;

  v_count:=cardinality(v_ids);
  if v_count=0 then raise exception 'no_transactions_selected'; end if;
  if v_count>200 then raise exception 'bulk_limit_exceeded'; end if;

  perform 1
  from financial_app.transactions t
  where t.id=any(v_ids)
  order by t.id
  for update;

  if (select count(*) from financial_app.transactions where id=any(v_ids))<>v_count then
    raise exception 'transaction_not_found' using errcode='P0002';
  end if;

  insert into financial_app.transaction_bulk_batches(id,created_by,patch,item_count)
  values(v_batch_id,v_email,p_patch,v_count);

  foreach v_id in array v_ids loop
    select * into strict v_before from financial_app.transactions where id=v_id;

    v_before_patch:=jsonb_build_object(
      'category',v_before.category_override,
      'subcategory',v_before.subcategory_override,
      'type',v_before.type_override,
      'normalizedConcept',v_before.normalized_concept_override,
      'counterparty',v_before.counterparty_override,
      'description',v_before.description_override,
      'effectiveDate',v_before.effective_date,
      'cashFlowOverride',v_before.cash_flow_override,
      'isInternalTransfer',v_before.is_internal_transfer,
      'isDuplicate',v_before.is_duplicate,
      'isReconciled',v_before.is_reconciled,
      'needsReview',v_before.needs_review,
      'isRecurring',v_before.is_recurring,
      'tags',to_jsonb(v_before.tags),
      'notes',v_before.notes
    );

    v_item_patch:=v_base_patch;
    if v_tag_operation is not null then
      if v_tag_mode='add' then
        select coalesce(array_agg(value order by first_position),array[]::text[])
        into v_next_tags
        from (
          select value,min(ordinality) as first_position
          from unnest(coalesce(v_before.tags,array[]::text[])||v_tag_values) with ordinality as u(value,ordinality)
          where btrim(value)<>''
          group by value
        ) q;
      else
        select coalesce(array_agg(value order by ordinality),array[]::text[])
        into v_next_tags
        from unnest(coalesce(v_before.tags,array[]::text[])) with ordinality as u(value,ordinality)
        where not (value=any(v_tag_values));
      end if;
      v_item_patch:=jsonb_set(v_item_patch,'{tags}',to_jsonb(v_next_tags),true);
    end if;

    perform financial_app.update_transaction_rpc(v_id,v_item_patch);
    select updated_at into v_after_updated_at from financial_app.transactions where id=v_id;

    insert into financial_app.transaction_bulk_batch_items(batch_id,transaction_id,before_patch,after_updated_at)
    values(v_batch_id,v_id,v_before_patch,v_after_updated_at);
  end loop;

  return jsonb_build_object(
    'ok',true,
    'updated',v_count,
    'ids',to_jsonb(v_ids),
    'batchId',v_batch_id,
    'canUndo',true,
    'tagOperation',case when v_tag_operation is null then null else jsonb_build_object('mode',v_tag_mode,'values',to_jsonb(v_tag_values)) end
  );
end
$$;

revoke all on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) from public, anon;
grant execute on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) to authenticated, service_role;

commit;
