create or replace function financial_app.validate_category_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_kind text;
  cycle_found boolean;
begin
  if exists (
    select 1
    from financial_app.categories child
    where child.parent_category_id = new.id
      and child.kind <> new.kind
  ) then
    raise exception 'category kind must match existing children';
  end if;

  if new.parent_category_id is null then
    return new;
  end if;

  if new.parent_category_id = new.id then
    raise exception 'category cannot be its own parent';
  end if;

  select kind into parent_kind
  from financial_app.categories
  where id = new.parent_category_id;

  if parent_kind is null then
    raise exception 'parent category does not exist';
  end if;

  if parent_kind <> new.kind then
    raise exception 'parent category must have the same kind';
  end if;

  with recursive ancestors as (
    select c.id, c.parent_category_id
    from financial_app.categories c
    where c.id = new.parent_category_id
    union all
    select c.id, c.parent_category_id
    from financial_app.categories c
    join ancestors a on c.id = a.parent_category_id
  )
  select exists(select 1 from ancestors where id = new.id) into cycle_found;

  if cycle_found then
    raise exception 'category hierarchy cannot contain cycles';
  end if;

  return new;
end;
$$;
