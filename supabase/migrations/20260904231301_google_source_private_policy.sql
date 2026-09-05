create table financial_app.google_source_policy (
  id boolean primary key default true check (id = true),
  allowed_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(allowed_email) <> ''),
  check (allowed_email = lower(btrim(allowed_email))),
  check (position('@' in allowed_email) > 1)
);

comment on table financial_app.google_source_policy is
  'Private singleton policy that authorizes the only Google account allowed to connect the official read-only bank source.';

create trigger google_source_policy_touch_updated_at
before update on financial_app.google_source_policy
for each row execute function financial_app.touch_updated_at();

alter table financial_app.google_source_policy enable row level security;

revoke all on table financial_app.google_source_policy from public, anon, authenticated, service_role;

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
  v_allowed_email text;
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

  select p.allowed_email
  into v_allowed_email
  from financial_app.google_source_policy p
  where p.id=true;

  if v_allowed_email is null then
    raise exception 'google_oauth_policy_not_configured';
  end if;

  if lower(btrim(p_account_email)) <> v_allowed_email then
    raise exception 'google_account_not_allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financial_app.google_oauth_connection'));

  select c.refresh_token_secret_id
  into v_previous_secret_id
  from financial_app.google_oauth_connections c
  where c.id=true
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

revoke all on function financial_app.store_google_oauth_connection(text,text,text,text[],text,text)
from public, anon, authenticated, service_role;

update financial_app.schema_meta
set schema_version=7, updated_at=now()
where id=true;
