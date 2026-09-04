create table financial_app.google_oauth_connections (
  id boolean primary key default true check (id = true),
  google_subject text not null,
  account_email text not null,
  refresh_token_secret_id uuid not null unique,
  scopes text[] not null,
  source_file_id text not null,
  source_file_name text not null,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(google_subject) <> ''),
  check (btrim(account_email) <> ''),
  check (btrim(source_file_id) <> ''),
  check (btrim(source_file_name) <> ''),
  check (
    cardinality(scopes) = 2
    and scopes @> array[
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]::text[]
    and scopes <@ array[
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]::text[]
  )
);

comment on table financial_app.google_oauth_connections is
  'Metadata for the single authorized Google OAuth connection. The refresh token itself lives encrypted in Supabase Vault.';

create trigger google_oauth_connections_touch_updated_at
before update on financial_app.google_oauth_connections
for each row execute function financial_app.touch_updated_at();

create or replace function financial_app.store_google_oauth_connection(
  p_google_subject text,
  p_account_email text,
  p_refresh_token text,
  p_scopes text[],
  p_source_file_id text,
  p_source_file_name text
)
returns table(connection_id boolean, refresh_token_secret_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_secret_id uuid;
  v_new_secret_id uuid;
  v_expected_scopes text[] := array[
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ]::text[];
begin
  if btrim(coalesce(p_google_subject,'')) = ''
     or btrim(coalesce(p_account_email,'')) = ''
     or btrim(coalesce(p_refresh_token,'')) = ''
     or btrim(coalesce(p_source_file_id,'')) = ''
     or btrim(coalesce(p_source_file_name,'')) = '' then
    raise exception 'invalid_google_oauth_connection';
  end if;

  if p_scopes is null
     or cardinality(p_scopes) <> 2
     or not (p_scopes @> v_expected_scopes and p_scopes <@ v_expected_scopes) then
    raise exception 'invalid_google_oauth_scopes';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financial_app.google_oauth_connection'));

  select refresh_token_secret_id
  into v_previous_secret_id
  from financial_app.google_oauth_connections
  where id=true
  for update;

  if v_previous_secret_id is not null then
    delete from vault.secrets where id=v_previous_secret_id;
  end if;

  v_new_secret_id := vault.create_secret(
    p_refresh_token,
    'financial_app_google_refresh_token',
    'Financial App Google OAuth refresh token',
    null
  );

  insert into financial_app.google_oauth_connections(
    id,google_subject,account_email,refresh_token_secret_id,scopes,
    source_file_id,source_file_name,connected_at,last_verified_at
  ) values (
    true,btrim(p_google_subject),lower(btrim(p_account_email)),v_new_secret_id,v_expected_scopes,
    btrim(p_source_file_id),btrim(p_source_file_name),now(),now()
  )
  on conflict (id) do update set
    google_subject=excluded.google_subject,
    account_email=excluded.account_email,
    refresh_token_secret_id=excluded.refresh_token_secret_id,
    scopes=excluded.scopes,
    source_file_id=excluded.source_file_id,
    source_file_name=excluded.source_file_name,
    connected_at=excluded.connected_at,
    last_verified_at=excluded.last_verified_at,
    updated_at=now();

  connection_id := true;
  refresh_token_secret_id := v_new_secret_id;
  return next;
end;
$$;

create or replace function financial_app.get_google_oauth_connection_status()
returns table(
  connected boolean,
  google_subject text,
  account_email text,
  scopes text[],
  source_file_id text,
  source_file_name text,
  connected_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    true,
    c.google_subject,
    c.account_email,
    c.scopes,
    c.source_file_id,
    c.source_file_name,
    c.connected_at,
    c.last_verified_at,
    c.updated_at
  from financial_app.google_oauth_connections c
  where c.id=true;
$$;

create or replace function financial_app.get_google_oauth_refresh_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from financial_app.google_oauth_connections c
  join vault.decrypted_secrets d on d.id=c.refresh_token_secret_id
  where c.id=true;
$$;

create or replace function financial_app.mark_google_oauth_verified()
returns void
language sql
security definer
set search_path = ''
as $$
  update financial_app.google_oauth_connections
  set last_verified_at=now(),updated_at=now()
  where id=true;
$$;

create or replace function financial_app.disconnect_google_oauth_connection()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financial_app.google_oauth_connection'));

  select refresh_token_secret_id
  into v_secret_id
  from financial_app.google_oauth_connections
  where id=true
  for update;

  if v_secret_id is null then
    return false;
  end if;

  delete from financial_app.google_oauth_connections where id=true;
  delete from vault.secrets where id=v_secret_id;
  return true;
end;
$$;

revoke all on table financial_app.google_oauth_connections from public, anon, authenticated, service_role;
revoke all on function financial_app.store_google_oauth_connection(text,text,text,text[],text,text) from public, anon, authenticated, service_role;
revoke all on function financial_app.get_google_oauth_connection_status() from public, anon, authenticated, service_role;
revoke all on function financial_app.get_google_oauth_refresh_token() from public, anon, authenticated, service_role;
revoke all on function financial_app.mark_google_oauth_verified() from public, anon, authenticated, service_role;
revoke all on function financial_app.disconnect_google_oauth_connection() from public, anon, authenticated, service_role;

update financial_app.schema_meta
set schema_version=5, updated_at=now()
where id=true;
