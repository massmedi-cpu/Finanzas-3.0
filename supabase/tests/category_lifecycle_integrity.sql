begin;

insert into financial_app.categories (
  id, name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
) values
  ('31000000-0000-4000-8000-000000000010'::uuid, 'Lifecycle parent test', 'expense', null, 'home', 'category.blue', 'active', 0),
  ('31000000-0000-4000-8000-000000000011'::uuid, 'Lifecycle active child test', 'expense', '31000000-0000-4000-8000-000000000010'::uuid, 'bolt', 'category.cyan', 'active', 0);

do $$
begin
  begin
    update financial_app.categories
    set lifecycle = 'archived'
    where id = '31000000-0000-4000-8000-000000000010'::uuid;
    raise exception 'expected archive rejection did not occur';
  exception
    when others then
      if sqlerrm = 'expected archive rejection did not occur' then
        raise;
      end if;
      if position('active child category requires an active parent' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end $$;

insert into financial_app.categories (
  id, name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
) values (
  '31000000-0000-4000-8000-000000000012'::uuid,
  'Lifecycle archived parent test',
  'expense',
  null,
  'home',
  'category.blue',
  'archived',
  0
);

do $$
begin
  begin
    insert into financial_app.categories (
      id, name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
    ) values (
      '31000000-0000-4000-8000-000000000013'::uuid,
      'Lifecycle forbidden active child test',
      'expense',
      '31000000-0000-4000-8000-000000000012'::uuid,
      'bolt',
      'category.cyan',
      'active',
      0
    );
    raise exception 'expected active-child rejection did not occur';
  exception
    when others then
      if sqlerrm = 'expected active-child rejection did not occur' then
        raise;
      end if;
      if position('active category requires an active parent' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end $$;

insert into financial_app.categories (
  id, name, kind, parent_category_id, icon_key, color_token, lifecycle, sort_order
) values (
  '31000000-0000-4000-8000-000000000014'::uuid,
  'Lifecycle allowed archived child test',
  'expense',
  '31000000-0000-4000-8000-000000000010'::uuid,
  'bolt',
  'category.cyan',
  'archived',
  1
);

do $$
declare
  parent_lifecycle text;
  child_lifecycle text;
  forbidden_child_exists boolean;
  archived_child_exists boolean;
begin
  select lifecycle into parent_lifecycle
  from financial_app.categories
  where id = '31000000-0000-4000-8000-000000000010'::uuid;

  select lifecycle into child_lifecycle
  from financial_app.categories
  where id = '31000000-0000-4000-8000-000000000011'::uuid;

  select exists(
    select 1 from financial_app.categories
    where id = '31000000-0000-4000-8000-000000000013'::uuid
  ) into forbidden_child_exists;

  select exists(
    select 1 from financial_app.categories
    where id = '31000000-0000-4000-8000-000000000014'::uuid
      and lifecycle = 'archived'
  ) into archived_child_exists;

  if parent_lifecycle <> 'active' then
    raise exception 'parent lifecycle protection failed';
  end if;
  if child_lifecycle <> 'active' then
    raise exception 'active child lifecycle changed unexpectedly';
  end if;
  if forbidden_child_exists then
    raise exception 'active child under archived parent was persisted';
  end if;
  if not archived_child_exists then
    raise exception 'valid archived child under active parent was rejected';
  end if;
end $$;

rollback;
