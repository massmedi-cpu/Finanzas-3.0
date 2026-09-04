create or replace function financial_app.merge_categories(
  p_source_category_id uuid,
  p_target_category_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_source_kind text;
  v_target_kind text;
  v_target_lifecycle text;
begin
  if p_source_category_id = p_target_category_id then
    raise exception 'same_category';
  end if;

  lock table financial_app.categories in share row exclusive mode;
  lock table financial_app.merchants in share row exclusive mode;
  lock table financial_app.transactions in share row exclusive mode;
  lock table financial_app.transaction_overrides in share row exclusive mode;
  lock table financial_app.categorization_rules in share row exclusive mode;
  lock table financial_app.recurrences in share row exclusive mode;
  lock table financial_app.budgets in share row exclusive mode;
  lock table financial_app.forecast_items in share row exclusive mode;

  select kind into v_source_kind
  from financial_app.categories
  where id = p_source_category_id;

  select kind, lifecycle into v_target_kind, v_target_lifecycle
  from financial_app.categories
  where id = p_target_category_id;

  if v_source_kind is null or v_target_kind is null then
    raise exception 'category_not_found';
  end if;
  if v_source_kind <> v_target_kind then
    raise exception 'category_kind_mismatch';
  end if;
  if v_target_lifecycle <> 'active' then
    raise exception 'target_category_archived';
  end if;

  if exists (
    with recursive descendants as (
      select id from financial_app.categories where parent_category_id = p_source_category_id
      union all
      select category.id
      from financial_app.categories category
      join descendants parent on category.parent_category_id = parent.id
    )
    select 1 from descendants where id = p_target_category_id
  ) then
    raise exception 'target_is_descendant';
  end if;

  if exists (
    select 1
    from financial_app.categories source_child
    join financial_app.categories target_child
      on target_child.parent_category_id = p_target_category_id
     and target_child.kind = source_child.kind
     and financial_app.normalize_label(target_child.name) = financial_app.normalize_label(source_child.name)
    where source_child.parent_category_id = p_source_category_id
      and source_child.id <> target_child.id
  ) then
    raise exception 'child_category_collision';
  end if;

  if exists (
    select 1
    from financial_app.budgets source_budget
    join financial_app.budgets target_budget
      on target_budget.month = source_budget.month
     and target_budget.category_id = p_target_category_id
    where source_budget.category_id = p_source_category_id
  ) then
    raise exception 'budget_collision';
  end if;

  update financial_app.categories set parent_category_id = p_target_category_id, updated_at = now() where parent_category_id = p_source_category_id;
  update financial_app.merchants set default_category_id = p_target_category_id, updated_at = now() where default_category_id = p_source_category_id;
  update financial_app.transactions set category_id = p_target_category_id, updated_at = now() where category_id = p_source_category_id;
  update financial_app.transaction_overrides set category_id_override = p_target_category_id, updated_at = now() where category_override_set = true and category_id_override = p_source_category_id;
  update financial_app.categorization_rules set target_category_id = p_target_category_id, updated_at = now() where target_category_id = p_source_category_id;
  update financial_app.recurrences set category_id = p_target_category_id, updated_at = now() where category_id = p_source_category_id;
  update financial_app.budgets set category_id = p_target_category_id, updated_at = now() where category_id = p_source_category_id;
  update financial_app.forecast_items set category_id = p_target_category_id, updated_at = now() where category_id = p_source_category_id;
  update financial_app.categories set lifecycle = 'archived', parent_category_id = null, updated_at = now() where id = p_source_category_id;
end;
$$;

comment on function financial_app.merge_categories(uuid, uuid) is
  'Canonical category merge mutation. Locks every category-reference table and enforces target activity, hierarchy and collision invariants atomically.';
