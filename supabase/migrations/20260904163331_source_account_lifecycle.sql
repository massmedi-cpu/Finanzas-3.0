create or replace function financial_app.ensure_source_account_mapping(
  p_source_file_id text,
  p_account_external_key text,
  p_account_name text,
  p_institution text,
  p_account_type text,
  p_opening_balance_cents bigint,
  p_lifecycle text,
  p_source_identifier text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_sort_order integer;
begin
  if btrim(coalesce(p_source_file_id,'')) = ''
     or btrim(coalesce(p_account_external_key,'')) = ''
     or btrim(coalesce(p_account_name,'')) = '' then
    raise exception 'invalid_source_account_mapping';
  end if;
  if p_account_type not in ('checking','savings','credit','cash','investment','other') then
    raise exception 'invalid_source_account_type';
  end if;
  if p_lifecycle not in ('active','archived') then
    raise exception 'invalid_source_account_lifecycle';
  end if;
  if p_opening_balance_cents not between -9007199254740991 and 9007199254740991 then
    raise exception 'invalid_opening_balance';
  end if;

  lock table financial_app.account_source_mappings in share row exclusive mode;
  lock table financial_app.accounts in share row exclusive mode;

  select account_id into v_account_id
  from financial_app.account_source_mappings
  where source_file_id=p_source_file_id
    and account_external_key=p_account_external_key;
  if v_account_id is not null then
    return v_account_id;
  end if;

  select id into v_account_id
  from financial_app.accounts
  where financial_app.normalize_label(name)=financial_app.normalize_label(p_account_name)
  limit 1;

  if v_account_id is null then
    select coalesce(max(sort_order)+1,0) into v_sort_order
    from financial_app.accounts where lifecycle=p_lifecycle;

    insert into financial_app.accounts(
      name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
    ) values (
      btrim(p_account_name),nullif(btrim(coalesce(p_institution,'')),''),p_account_type,
      p_opening_balance_cents,'EUR',p_lifecycle,v_sort_order
    ) returning id into v_account_id;
  end if;

  insert into financial_app.account_source_mappings(
    source_file_id,account_external_key,account_id,source_account_name,source_identifier
  ) values (
    btrim(p_source_file_id),btrim(p_account_external_key),v_account_id,btrim(p_account_name),
    nullif(btrim(coalesce(p_source_identifier,'')),'')
  );

  return v_account_id;
end;
$$;

create or replace function financial_app.ensure_source_account_mapping(
  p_source_file_id text,
  p_account_external_key text,
  p_account_name text,
  p_institution text,
  p_account_type text,
  p_opening_balance_cents bigint,
  p_source_identifier text default null
)
returns uuid
language sql
set search_path = ''
as $$
  select financial_app.ensure_source_account_mapping(
    p_source_file_id,
    p_account_external_key,
    p_account_name,
    p_institution,
    p_account_type,
    p_opening_balance_cents,
    'active',
    p_source_identifier
  );
$$;

revoke all on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text,text) from public, anon, authenticated;
grant execute on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text,text) to service_role;

revoke all on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text) to service_role;
