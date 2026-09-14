begin;

create or replace function financial_app.apply_categorization_rule(p_transaction_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eval jsonb;
  v_workspace_id uuid;
  v_current_merchant uuid;
  v_current_category uuid;
  v_current_origin text;
  v_new_merchant uuid;
  v_new_category uuid;
  v_new_origin text;
  v_merchant_locked boolean;
  v_category_locked boolean;
  v_merchant_changed boolean;
  v_category_changed boolean;
begin
  v_eval := financial_app.evaluate_categorization_rule(p_transaction_id);
  select workspace_id,merchant_id,category_id,category_origin
    into v_workspace_id,v_current_merchant,v_current_category,v_current_origin
  from financial_app.transactions where id=p_transaction_id for update;
  if not found then raise exception 'transaction_not_found'; end if;

  v_merchant_locked := coalesce((v_eval->>'merchantLocked')::boolean,false);
  v_category_locked := coalesce((v_eval->>'categoryLocked')::boolean,false);
  v_new_merchant := (v_eval->>'resolvedMerchantId')::uuid;
  v_new_category := (v_eval->>'resolvedCategoryId')::uuid;
  v_new_origin := case v_eval->>'categoryResolutionSource'
    when 'rule' then 'rule'
    when 'merchant' then 'merchant'
    when 'builtin' then 'builtin'
    else null
  end;
  v_merchant_changed := not v_merchant_locked and v_current_merchant is distinct from v_new_merchant;
  v_category_changed := not v_category_locked and v_current_category is distinct from v_new_category;

  if v_merchant_changed or v_category_changed or (not v_category_locked and v_current_origin is distinct from v_new_origin) then
    update financial_app.transactions
    set merchant_id=case when v_merchant_changed then v_new_merchant else merchant_id end,
        category_id=case when not v_category_locked then v_new_category else category_id end,
        category_origin=case when not v_category_locked then v_new_origin else category_origin end,
        updated_at=now()
    where id=p_transaction_id;
  end if;

  if v_merchant_changed then
    insert into financial_app.audit_changes(workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values (v_workspace_id,'transaction',p_transaction_id,'merchant_id',to_jsonb(v_current_merchant),to_jsonb(v_new_merchant),'system_rule');
  end if;
  if v_category_changed then
    insert into financial_app.audit_changes(workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values (v_workspace_id,'transaction',p_transaction_id,'category_id',to_jsonb(v_current_category),to_jsonb(v_new_category),'system_rule');
  end if;

  return v_eval || jsonb_build_object('applied',true,'merchantChanged',v_merchant_changed,'categoryChanged',v_category_changed);
end;
$$;

commit;