begin;

do $$
declare
  v_expected_scopes text[] := array[
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ]::text[];
  v_stored record;
begin
  delete from financial_app.google_source_policy where id=true;

  begin
    perform * from financial_app.store_google_oauth_connection(
      '__policy_subject_missing__',
      'phase2-policy@example.invalid',
      '__policy_refresh_missing__',
      v_expected_scopes,
      '__policy_source__',
      'Movimientos bancarios - fuente'
    );
    raise exception 'expected_missing_policy_rejection';
  exception when others then
    if sqlerrm = 'expected_missing_policy_rejection' then raise; end if;
    if sqlerrm <> 'google_oauth_policy_not_configured' then raise; end if;
  end;

  insert into financial_app.google_source_policy(id,allowed_email)
  values(true,'phase2-policy@example.invalid');

  begin
    perform * from financial_app.store_google_oauth_connection(
      '__policy_subject_wrong__',
      'different@example.invalid',
      '__policy_refresh_wrong__',
      v_expected_scopes,
      '__policy_source__',
      'Movimientos bancarios - fuente'
    );
    raise exception 'expected_account_policy_rejection';
  exception when others then
    if sqlerrm = 'expected_account_policy_rejection' then raise; end if;
    if sqlerrm <> 'google_account_not_allowed' then raise; end if;
  end;

  select * into v_stored
  from financial_app.store_google_oauth_connection(
    '__policy_subject_ok__',
    'PHASE2-POLICY@EXAMPLE.INVALID',
    '__policy_refresh_ok__',
    v_expected_scopes,
    '__policy_source__',
    'Movimientos bancarios - fuente'
  );

  if v_stored.connection_id is not true then
    raise exception 'matching_policy_not_stored';
  end if;

  if not exists (
    select 1 from financial_app.google_oauth_connections
    where id=true and account_email='phase2-policy@example.invalid'
  ) then
    raise exception 'stored_account_not_normalized';
  end if;

  if has_schema_privilege('anon','financial_app','USAGE')
     or has_schema_privilege('authenticated','financial_app','USAGE') then
    raise exception 'private_schema_exposed';
  end if;

  if has_table_privilege('anon','financial_app.google_source_policy','SELECT')
     or has_table_privilege('authenticated','financial_app.google_source_policy','SELECT') then
    raise exception 'google_source_policy_exposed';
  end if;
end $$;

rollback;
