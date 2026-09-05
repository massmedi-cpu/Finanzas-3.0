begin;

alter table financial_app.categorization_rules
  add column category_id uuid references financial_app.categories(id) on delete set null;

alter table financial_app.categorization_rules
  add constraint categorization_rules_has_condition check (
    concept_contains is not null
    or merchant_id is not null
    or account_id is not null
    or category_id is not null
    or minimum_amount_cents is not null
    or maximum_amount_cents is not null
  ),
  add constraint categorization_rules_has_target check (
    target_category_id is not null or target_merchant_id is not null
  ),
  add constraint categorization_rules_concept_not_blank check (
    concept_contains is null or pg_catalog.btrim(concept_contains) <> ''
  );

create index categorization_rules_account_idx on financial_app.categorization_rules (account_id) where account_id is not null;
create index categorization_rules_merchant_idx on financial_app.categorization_rules (merchant_id) where merchant_id is not null;
create index categorization_rules_category_idx on financial_app.categorization_rules (category_id) where category_id is not null;

create or replace function financial_app.save_categorization_rule(
  p_rule_id uuid,
  p_name text,
  p_status text,
  p_priority integer,
  p_concept_contains text,
  p_merchant_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_minimum_amount_cents bigint,
  p_maximum_amount_cents bigint,
  p_target_category_id uuid,
  p_target_merchant_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_rule_id uuid;
  v_name text;
  v_concept text;
  v_before jsonb;
  v_after jsonb;
begin
  v_name := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  if v_name = '' then raise exception 'rule_name_required'; end if;
  if p_status not in ('active','disabled') then raise exception 'invalid_rule_status'; end if;
  if p_priority is null or p_priority < 0 or p_priority > 1000000 then raise exception 'invalid_rule_priority'; end if;

  v_concept := nullif(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_concept_contains,''), '\s+', ' ', 'g')), '');
  if p_concept_contains is not null and v_concept is null then raise exception 'rule_concept_required'; end if;

  if v_concept is null and p_merchant_id is null and p_account_id is null and p_category_id is null
     and p_minimum_amount_cents is null and p_maximum_amount_cents is null then
    raise exception 'rule_condition_required';
  end if;
  if p_target_category_id is null and p_target_merchant_id is null then
    raise exception 'rule_target_required';
  end if;
  if p_minimum_amount_cents is not null and p_maximum_amount_cents is not null
     and p_minimum_amount_cents > p_maximum_amount_cents then
    raise exception 'invalid_rule_amount_range';
  end if;

  if p_account_id is not null and not exists (select 1 from financial_app.accounts a where a.id=p_account_id) then
    raise exception 'rule_account_not_found';
  end if;
  if p_merchant_id is not null and not exists (select 1 from financial_app.merchants m where m.id=p_merchant_id) then
    raise exception 'rule_merchant_not_found';
  end if;
  if p_category_id is not null and not exists (select 1 from financial_app.categories c where c.id=p_category_id) then
    raise exception 'rule_category_not_found';
  end if;
  if p_target_merchant_id is not null and not exists (
    select 1 from financial_app.merchants m where m.id=p_target_merchant_id and m.lifecycle='active'
  ) then
    raise exception 'rule_target_merchant_not_active';
  end if;
  if p_target_category_id is not null and not exists (
    select 1 from financial_app.categories c where c.id=p_target_category_id and c.lifecycle='active'
  ) then
    raise exception 'rule_target_category_not_active';
  end if;

  if p_rule_id is null then
    insert into financial_app.categorization_rules(
      name,status,priority,concept_contains,merchant_id,account_id,category_id,
      minimum_amount_cents,maximum_amount_cents,target_category_id,target_merchant_id
    ) values (
      v_name,p_status,p_priority,v_concept,p_merchant_id,p_account_id,p_category_id,
      p_minimum_amount_cents,p_maximum_amount_cents,p_target_category_id,p_target_merchant_id
    ) returning id into v_rule_id;
  else
    select to_jsonb(r) into v_before from financial_app.categorization_rules r where r.id=p_rule_id;
    update financial_app.categorization_rules
    set name=v_name,status=p_status,priority=p_priority,concept_contains=v_concept,
        merchant_id=p_merchant_id,account_id=p_account_id,category_id=p_category_id,
        minimum_amount_cents=p_minimum_amount_cents,maximum_amount_cents=p_maximum_amount_cents,
        target_category_id=p_target_category_id,target_merchant_id=p_target_merchant_id,
        updated_at=now()
    where id=p_rule_id
    returning id into v_rule_id;
    if v_rule_id is null then raise exception 'rule_not_found'; end if;
  end if;

  select to_jsonb(r) into v_after from financial_app.categorization_rules r where r.id=v_rule_id;
  if v_before is distinct from v_after then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value)
    values ('rule',v_rule_id,'definition',v_before,v_after);
  end if;
  return v_rule_id;
end;
$$;

create or replace function financial_app.evaluate_categorization_rule(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_context record;
  v_rule financial_app.categorization_rules%rowtype;
  v_concept text;
  v_normalized_concept text;
  v_merchant_locked boolean;
  v_category_locked boolean;
  v_effective_merchant uuid;
  v_effective_category uuid;
  v_baseline_merchant uuid;
  v_baseline_category uuid;
  v_resolved_merchant uuid;
  v_resolved_category uuid;
begin
  select
    t.id,t.account_id,t.concept_normalized,t.merchant_id,t.category_id,t.amount_cents,
    o.concept_override,o.merchant_id_override,o.merchant_override_set,
    o.category_id_override,o.category_override_set
  into v_context
  from financial_app.transactions t
  left join financial_app.transaction_overrides o on o.transaction_id=t.id
  where t.id=p_transaction_id;

  if not found then raise exception 'transaction_not_found'; end if;

  v_concept := coalesce(v_context.concept_override,v_context.concept_normalized);
  v_normalized_concept := financial_app.normalize_merchant_label(v_concept);
  v_merchant_locked := coalesce(v_context.merchant_override_set,false) or v_context.merchant_id_override is not null;
  v_category_locked := coalesce(v_context.category_override_set,false) or v_context.category_id_override is not null;

  v_effective_merchant := case
    when coalesce(v_context.merchant_override_set,false) then v_context.merchant_id_override
    when v_context.merchant_id_override is not null then v_context.merchant_id_override
    else v_context.merchant_id
  end;
  v_effective_category := case
    when coalesce(v_context.category_override_set,false) then v_context.category_id_override
    when v_context.category_id_override is not null then v_context.category_id_override
    else v_context.category_id
  end;

  if v_merchant_locked then
    v_baseline_merchant := v_effective_merchant;
  else
    v_baseline_merchant := coalesce(v_effective_merchant,financial_app.resolve_merchant_id(v_concept));
  end if;

  if v_category_locked then
    v_baseline_category := v_effective_category;
  else
    v_baseline_category := coalesce(v_effective_category,financial_app.resolve_merchant_default_category_id(v_baseline_merchant));
  end if;

  select r.* into v_rule
  from financial_app.categorization_rules r
  where r.status='active'
    and (r.concept_contains is null or pg_catalog.strpos(v_normalized_concept,financial_app.normalize_merchant_label(r.concept_contains)) > 0)
    and (r.account_id is null or r.account_id=v_context.account_id)
    and (r.merchant_id is null or r.merchant_id=v_baseline_merchant)
    and (r.category_id is null or r.category_id=v_baseline_category)
    and (r.minimum_amount_cents is null or v_context.amount_cents >= r.minimum_amount_cents)
    and (r.maximum_amount_cents is null or v_context.amount_cents <= r.maximum_amount_cents)
  order by r.priority asc,r.id asc
  limit 1;

  v_resolved_merchant := v_baseline_merchant;
  if v_rule.id is not null and v_rule.target_merchant_id is not null and not v_merchant_locked then
    v_resolved_merchant := v_rule.target_merchant_id;
  end if;

  if v_category_locked then
    v_resolved_category := v_effective_category;
  elsif v_rule.id is not null and v_rule.target_category_id is not null then
    v_resolved_category := v_rule.target_category_id;
  else
    v_resolved_category := coalesce(financial_app.resolve_merchant_default_category_id(v_resolved_merchant),v_baseline_category);
  end if;

  return jsonb_build_object(
    'transactionId',v_context.id,
    'concept',v_concept,
    'normalizedConcept',v_normalized_concept,
    'amountCents',v_context.amount_cents,
    'accountId',v_context.account_id,
    'baselineMerchantId',v_baseline_merchant,
    'baselineCategoryId',v_baseline_category,
    'resolvedMerchantId',v_resolved_merchant,
    'resolvedCategoryId',v_resolved_category,
    'merchantLocked',v_merchant_locked,
    'categoryLocked',v_category_locked,
    'selectedRuleId',v_rule.id,
    'selectedRuleName',v_rule.name,
    'selectedRulePriority',v_rule.priority,
    'matchedCriteria',case when v_rule.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'conceptContains',v_rule.concept_contains,
      'accountId',v_rule.account_id,
      'merchantId',v_rule.merchant_id,
      'categoryId',v_rule.category_id,
      'minimumAmountCents',v_rule.minimum_amount_cents,
      'maximumAmountCents',v_rule.maximum_amount_cents
    )) end,
    'merchantChanged',not v_merchant_locked and v_context.merchant_id is distinct from v_resolved_merchant,
    'categoryChanged',not v_category_locked and v_context.category_id is distinct from v_resolved_category
  );
end;
$$;

create or replace function financial_app.apply_categorization_rule(p_transaction_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eval jsonb;
  v_current_merchant uuid;
  v_current_category uuid;
  v_new_merchant uuid;
  v_new_category uuid;
  v_merchant_locked boolean;
  v_category_locked boolean;
  v_merchant_changed boolean;
  v_category_changed boolean;
begin
  v_eval := financial_app.evaluate_categorization_rule(p_transaction_id);
  select merchant_id,category_id into v_current_merchant,v_current_category
  from financial_app.transactions where id=p_transaction_id for update;
  if not found then raise exception 'transaction_not_found'; end if;

  v_merchant_locked := coalesce((v_eval->>'merchantLocked')::boolean,false);
  v_category_locked := coalesce((v_eval->>'categoryLocked')::boolean,false);
  v_new_merchant := (v_eval->>'resolvedMerchantId')::uuid;
  v_new_category := (v_eval->>'resolvedCategoryId')::uuid;
  v_merchant_changed := not v_merchant_locked and v_current_merchant is distinct from v_new_merchant;
  v_category_changed := not v_category_locked and v_current_category is distinct from v_new_category;

  if v_merchant_changed or v_category_changed then
    update financial_app.transactions
    set merchant_id=case when v_merchant_changed then v_new_merchant else merchant_id end,
        category_id=case when v_category_changed then v_new_category else category_id end
    where id=p_transaction_id;
  end if;

  if v_merchant_changed then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value)
    values ('transaction',p_transaction_id,'merchant_id',to_jsonb(v_current_merchant),to_jsonb(v_new_merchant));
  end if;
  if v_category_changed then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value)
    values ('transaction',p_transaction_id,'category_id',to_jsonb(v_current_category),to_jsonb(v_new_category));
  end if;

  return v_eval || jsonb_build_object(
    'applied',true,
    'merchantChanged',v_merchant_changed,
    'categoryChanged',v_category_changed
  );
end;
$$;

create or replace function financial_app.apply_categorization_rules(p_limit integer default 10000)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_result jsonb;
  v_evaluated integer := 0;
  v_matched integer := 0;
  v_merchant_changed integer := 0;
  v_category_changed integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then raise exception 'invalid_rule_apply_limit'; end if;
  for v_row in
    select id from financial_app.transactions order by bank_date desc,id limit p_limit
  loop
    v_result := financial_app.apply_categorization_rule(v_row.id);
    v_evaluated := v_evaluated + 1;
    if (v_result->>'selectedRuleId') is not null then v_matched := v_matched + 1; end if;
    if coalesce((v_result->>'merchantChanged')::boolean,false) then v_merchant_changed := v_merchant_changed + 1; end if;
    if coalesce((v_result->>'categoryChanged')::boolean,false) then v_category_changed := v_category_changed + 1; end if;
  end loop;
  return jsonb_build_object(
    'evaluated',v_evaluated,
    'matched',v_matched,
    'merchantChanged',v_merchant_changed,
    'categoryChanged',v_category_changed,
    'limit',p_limit
  );
end;
$$;

revoke all on function financial_app.save_categorization_rule(uuid,text,text,integer,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid) from public,anon,authenticated;
revoke all on function financial_app.evaluate_categorization_rule(uuid) from public,anon,authenticated;
revoke all on function financial_app.apply_categorization_rule(uuid) from public,anon,authenticated;
revoke all on function financial_app.apply_categorization_rules(integer) from public,anon,authenticated;

grant execute on function financial_app.save_categorization_rule(uuid,text,text,integer,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid) to service_role;
grant execute on function financial_app.evaluate_categorization_rule(uuid) to service_role;
grant execute on function financial_app.apply_categorization_rule(uuid) to service_role;
grant execute on function financial_app.apply_categorization_rules(integer) to service_role;

update financial_app.schema_meta set schema_version=9,updated_at=now() where id=true;

commit;
