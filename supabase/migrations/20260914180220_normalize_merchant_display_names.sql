create or replace function financial_app.normalize_merchant_display_name(value text)
returns text
language sql
immutable
strict
set search_path to ''
as $$
  with cleaned as (
    select pg_catalog.btrim(pg_catalog.regexp_replace(value, '\s+', ' ', 'g')) as name
  ), tokens as (
    select
      token,
      ordinality,
      pg_catalog.regexp_replace(token, '[^[:alpha:]]', '', 'g') as letters
    from cleaned
    cross join lateral pg_catalog.regexp_split_to_table(name, '\s+') with ordinality as parts(token, ordinality)
  )
  select pg_catalog.string_agg(
    case
      when ordinality > 1 and pg_catalog.lower(token) in ('a','al','con','de','del','e','el','en','la','las','los','para','por','sin','y')
        then pg_catalog.lower(token)
      when pg_catalog.length(letters) >= 2
        and letters = pg_catalog.upper(letters)
        and letters <> pg_catalog.lower(letters)
        and letters !~ '^[IVXLCDM]+$'
        then pg_catalog.initcap(pg_catalog.lower(token))
      else token
    end,
    ' ' order by ordinality
  )
  from tokens;
$$;

create or replace function financial_app.prepare_merchant_identity()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_name text;
  v_normalized text;
begin
  v_name := financial_app.normalize_merchant_display_name(coalesce(new.name,''));
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

update financial_app.merchants
set name = financial_app.normalize_merchant_display_name(name)
where name is distinct from financial_app.normalize_merchant_display_name(name);

revoke all on function financial_app.normalize_merchant_display_name(text) from public,anon,authenticated;
grant execute on function financial_app.normalize_merchant_display_name(text) to financial_app_gateway;
