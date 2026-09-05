begin;

do $$
declare
  v_allowed_email text;
  v_first_value text := repeat(chr(120), 32);
  v_second_value text := repeat(chr(121), 32);
  first_secret uuid;
  second_secret uuid;
  status_row record;
  disconnected boolean;
begin
  select allowed_email into v_allowed_email
  from financial_app.google_source_policy
  where id = true;

  if v_allowed_email is null or btrim(v_allowed_email) = '' then
    raise exception 'google_source_policy_missing';
  end if;

  select r.refresh_token_secret_id into first_secret
  from financial_app.store_google_oauth_connection(
    '__google_subject_test__',
    upper(v_allowed_email),
    v_first_value,
    array[
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]::text[],
    '__source_file_test__',
    'Movimientos bancarios - fuente'
  ) r;

  if first_secret is null then raise exception 'missing_first_secret'; end if;
  if financial_app.get_google_oauth_refresh_token() <> v_first_value then raise exception 'first_token_unreadable'; end if;

  select * into status_row from financial_app.get_google_oauth_connection_status();
  if status_row.connected is not true
     or status_row.account_email <> lower(v_allowed_email)
     or status_row.source_file_id <> '__source_file_test__'
     or cardinality(status_row.scopes) <> 2 then
    raise exception 'status_metadata_invalid';
  end if;

  select r.refresh_token_secret_id into second_secret
  from financial_app.store_google_oauth_connection(
    '__google_subject_test__',
    lower(v_allowed_email),
    v_second_value,
    array[
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]::text[],
    '__source_file_test__',
    'Movimientos bancarios - fuente'
  ) r;

  if second_secret is null or second_secret = first_secret then raise exception 'secret_rotation_failed'; end if;
  if exists(select 1 from vault.secrets where id=first_secret) then raise exception 'old_secret_not_removed'; end if;
  if financial_app.get_google_oauth_refresh_token() <> v_second_value then raise exception 'rotated_token_unreadable'; end if;

  perform financial_app.mark_google_oauth_verified();
  if (select last_verified_at is null from financial_app.google_oauth_connections where id=true) then
    raise exception 'verification_timestamp_missing';
  end if;

  disconnected := financial_app.disconnect_google_oauth_connection();
  if disconnected is not true then raise exception 'disconnect_failed'; end if;
  if exists(select 1 from financial_app.google_oauth_connections) then raise exception 'connection_residue'; end if;
  if exists(select 1 from vault.secrets where id=second_secret) then raise exception 'vault_secret_residue'; end if;
end $$;

rollback;

select
  (select count(*)::int from financial_app.google_oauth_connections) as connection_residue,
  (select count(*)::int from vault.secrets where name='financial_app_google_refresh_token') as vault_residue,
  has_function_privilege('anon','financial_app.get_google_oauth_refresh_token()','EXECUTE') as anon_can_read_token,
  has_function_privilege('authenticated','financial_app.get_google_oauth_refresh_token()','EXECUTE') as authenticated_can_read_token,
  has_function_privilege('service_role','financial_app.get_google_oauth_refresh_token()','EXECUTE') as service_role_can_read_token;
