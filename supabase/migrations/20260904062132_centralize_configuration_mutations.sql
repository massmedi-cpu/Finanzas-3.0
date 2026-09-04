create or replace function financial_app.reorder_accounts(p_ordered_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current_count integer;
  v_ordered_count integer;
begin
  lock table financial_app.accounts in share row exclusive mode;

  if p_ordered_ids is null then
    raise exception 'invalid_reorder_set';
  end if;

  select count(*) into v_current_count from financial_app.accounts;
  v_ordered_count := cardinality(p_ordered_ids);

  if v_ordered_count <> v_current_count
     or (select count(distinct item.id) from unnest(p_ordered_ids) as item(id)) <> v_ordered_count
     or exists (
       select account.id from financial_app.accounts account
       except select item.id from unnest(p_ordered_ids) as item(id)
     )
     or exists (
       select item.id from unnest(p_ordered_ids) as item(id)
       except select account.id from financial_app.accounts account
     ) then
    raise exception 'invalid_reorder_set';
  end if;

  if exists (
    with current_order as (
      select id, lifecycle, row_number() over (
        order by case lifecycle when 'active' then 0 else 1 end, sort_order, name, id
      ) as position
      from financial_app.accounts
    ), incoming_order as (
      select id, ordinality as position
      from unnest(p_ordered_ids) with ordinality as incoming(id, ordinality)
    )
    select 1
    from current_order current_item
    join incoming_order incoming_item using (position)
    join financial_app.accounts incoming_account on incoming_account.id = incoming_item.id
    where current_item.lifecycle <> incoming_account.lifecycle
  ) then
    raise exception 'account_reorder_group_mismatch';
  end if;

  with ordered as (
    select id, ordinality - 1 as sort_order
    from unnest(p_ordered_ids) with ordinality as incoming(id, ordinality)
  )
  update financial_app.accounts account
  set sort_order = ordered.sort_order,
      updated_at = now()
  from ordered
  where account.id = ordered.id;
end;
$$;

create or replace function financial_app.reorder_categories(p_ordered_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current_count integer;
  v_ordered_count integer;
begin
  lock table financial_app.categories in share row exclusive mode;

  if p_ordered_ids is null then
    raise exception 'invalid_reorder_set';
  end if;

  select count(*) into v_current_count from financial_app.categories;
  v_ordered_count := cardinality(p_ordered_ids);

  if v_ordered_count <> v_current_count
     or (select count(distinct item.id) from unnest(p_ordered_ids) as item(id)) <> v_ordered_count
     or exists (
       select category.id from financial_app.categories category
       except select item.id from unnest(p_ordered_ids) as item(id)
     )
     or exists (
       select item.id from unnest(p_ordered_ids) as item(id)
       except select category.id from financial_app.categories category
     ) then
    raise exception 'invalid_reorder_set';
  end if;

  if exists (
    with current_order as (
      select id, kind, parent_category_id, row_number() over (
        order by kind, parent_category_id nulls first, sort_order, name, id
      ) as position
      from financial_app.categories
    ), incoming_order as (
      select id, ordinality as position
      from unnest(p_ordered_ids) with ordinality as incoming(id, ordinality)
    )
    select 1
    from current_order current_item
    join incoming_order incoming_item using (position)
    join financial_app.categories incoming_category on incoming_category.id = incoming_item.id
    where current_item.kind <> incoming_category.kind
       or current_item.parent_category_id is distinct from incoming_category.parent_category_id
  ) then
    raise exception 'category_reorder_group_mismatch';
  end if;

  with ordered as (
    select id, ordinality - 1 as sort_order
    from unnest(p_ordered_ids) with ordinality as incoming(id, ordinality)
  )
  update financial_app.categories category
  set sort_order = ordered.sort_order,
      updated_at = now()
  from ordered
  where category.id = ordered.id;
end;
$$;

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
  lock table financial_app.budgets in share row exclusive mode;

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

comment on function financial_app.reorder_accounts(uuid[]) is
  'Canonical account reorder mutation. Enforces exact set and lifecycle group boundaries under a table lock.';
comment on function financial_app.reorder_categories(uuid[]) is
  'Canonical category reorder mutation. Enforces exact set and sibling kind/parent boundaries under a table lock.';
comment on function financial_app.merge_categories(uuid, uuid) is
  'Canonical category merge mutation. Enforces target activity, hierarchy and collision invariants atomically.';
