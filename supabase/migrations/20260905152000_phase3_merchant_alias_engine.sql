begin;

create or replace function financial_app.normalize_merchant_label(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      translate(
        lower(value),
        'áàäâãåéèëêíìïîóòöôõúùüûñç',
        'aaaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

alter table financial_app.merchants
  add column name text;

update financial_app.merchants
set name = normalized_name
where name is null;

alter table financial_app.merchants
  alter column name set not null;

alter table financial_app.merchant_aliases
  add column updated_at timestamptz not null default now();

create or replace function financial_app.prepare_merchant_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_normalized text;
begin
  v_name := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.name,''), '\s+', ' ', 'g'));
  if v_name = '' then
    raise exception 'merchant_name_required';
  end if;

  v_normalized := financial_app.normalize_merchant_label(v_name);
  if v_normalized = '' then
    raise exception 'merchant_name_not_resolvable';
  end if;

  if exists (
    select 1
    from financial_app.merchant_aliases a
    where a.normalized_alias = v_normalized
  ) then
    raise exception 'merchant_name_conflicts_with_alias';
  end if;

  new.name := v_name;
  new.normalized_name := v_normalized;
  return new;
end;
$$;

create or replace function financial_app.prepare_merchant_alias_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_alias text;
  v_normalized text;
begin
  v_alias := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(new.alias,''), '\s+', ' ', 'g'));
  if v_alias = '' then
    raise exception 'merchant_alias_required';
  end if;

  v_normalized := financial_app.normalize_merchant_label(v_alias);
  if v_normalized = '' then
    raise exception 'merchant_alias_not_resolvable';
  end if;

  if exists (
    select 1
    from financial_app.merchants m
    where m.normalized_name = v_normalized
  ) then
    raise exception 'merchant_alias_conflicts_with_canonical_name';
  end if;

  new.alias := v_alias;
  new.normalized_alias := v_normalized;
  return new;
end;
$$;

create trigger merchants_prepare_identity
before insert or update of name, normalized_name
on financial_app.merchants
for each row execute function financial_app.prepare_merchant_identity();

create trigger merchant_aliases_prepare_identity
before insert or update of alias, normalized_alias, merchant_id
on financial_app.merchant_aliases
for each row execute function financial_app.prepare_merchant_alias_identity();

create trigger merchant_aliases_touch_updated_at
before update on financial_app.merchant_aliases
for each row execute function financial_app.touch_updated_at();

create index merchants_lifecycle_name_idx
  on financial_app.merchants (lifecycle, normalized_name, id);

create or replace function financial_app.save_merchant(
  p_merchant_id uuid,
  p_name text,
  p_default_category_id uuid,
  p_lifecycle text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_merchant_id uuid;
begin
  if p_lifecycle not in ('active','archived') then
    raise exception 'invalid_merchant_lifecycle';
  end if;

  if p_default_category_id is not null and not exists (
    select 1
    from financial_app.categories c
    where c.id = p_default_category_id
      and c.lifecycle = 'active'
  ) then
    raise exception 'invalid_merchant_default_category';
  end if;

  if p_merchant_id is null then
    insert into financial_app.merchants(name, normalized_name, default_category_id, lifecycle)
    values (p_name, '__prepared_by_trigger__', p_default_category_id, p_lifecycle)
    returning id into v_merchant_id;
  else
    update financial_app.merchants
    set name = p_name,
        default_category_id = p_default_category_id,
        lifecycle = p_lifecycle,
        updated_at = now()
    where id = p_merchant_id
    returning id into v_merchant_id;

    if v_merchant_id is null then
      raise exception 'merchant_not_found';
    end if;
  end if;

  return v_merchant_id;
end;
$$;

create or replace function financial_app.save_merchant_alias(
  p_alias_id uuid,
  p_merchant_id uuid,
  p_alias text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_alias_id uuid;
begin
  if not exists (
    select 1
    from financial_app.merchants m
    where m.id = p_merchant_id
  ) then
    raise exception 'merchant_not_found';
  end if;

  if p_alias_id is null then
    insert into financial_app.merchant_aliases(merchant_id, alias, normalized_alias)
    values (p_merchant_id, p_alias, '__prepared_by_trigger__')
    returning id into v_alias_id;
  else
    update financial_app.merchant_aliases
    set merchant_id = p_merchant_id,
        alias = p_alias,
        updated_at = now()
    where id = p_alias_id
    returning id into v_alias_id;

    if v_alias_id is null then
      raise exception 'merchant_alias_not_found';
    end if;
  end if;

  return v_alias_id;
end;
$$;

create or replace function financial_app.delete_merchant_alias(p_alias_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from financial_app.merchant_aliases
  where id = p_alias_id;
  return found;
end;
$$;

create or replace function financial_app.resolve_merchant_id(p_label text)
returns uuid
language sql
stable
set search_path = ''
as $$
  with key as (
    select financial_app.normalize_merchant_label(p_label) as normalized
  ), candidates as (
    select m.id, 1 as source_rank
    from financial_app.merchants m
    cross join key k
    where m.lifecycle = 'active'
      and m.normalized_name = k.normalized

    union all

    select a.merchant_id, 2 as source_rank
    from financial_app.merchant_aliases a
    join financial_app.merchants m on m.id = a.merchant_id
    cross join key k
    where m.lifecycle = 'active'
      and a.normalized_alias = k.normalized
  )
  select c.id
  from candidates c
  order by c.source_rank, c.id
  limit 1;
$$;

create or replace function financial_app.resolve_merchant_default_category_id(p_merchant_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select c.id
  from financial_app.merchants m
  join financial_app.categories c on c.id = m.default_category_id
  where m.id = p_merchant_id
    and m.lifecycle = 'active'
    and c.lifecycle = 'active'
  limit 1;
$$;

revoke all on function financial_app.normalize_merchant_label(text) from public, anon, authenticated;
revoke all on function financial_app.save_merchant(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.save_merchant_alias(uuid,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.delete_merchant_alias(uuid) from public, anon, authenticated;
revoke all on function financial_app.resolve_merchant_id(text) from public, anon, authenticated;
revoke all on function financial_app.resolve_merchant_default_category_id(uuid) from public, anon, authenticated;

grant execute on function financial_app.normalize_merchant_label(text) to service_role;
grant execute on function financial_app.save_merchant(uuid,text,uuid,text) to service_role;
grant execute on function financial_app.save_merchant_alias(uuid,uuid,text) to service_role;
grant execute on function financial_app.delete_merchant_alias(uuid) to service_role;
grant execute on function financial_app.resolve_merchant_id(text) to service_role;
grant execute on function financial_app.resolve_merchant_default_category_id(uuid) to service_role;

update financial_app.schema_meta
set schema_version = 8, updated_at = now()
where id = true;

commit;
