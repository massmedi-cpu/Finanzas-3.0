-- Financial App · PRE-001 · aislamiento workspace efectivo
-- Segunda capa acumulativa sobre 20260909185000_pre001_workspace_tenancy.sql.
-- No debe desplegarse separada del Edge Gateway que establece el contexto de workspace.

-- -----------------------------------------------------------------------------
-- 1. Rol de ejecución sin privilegios que puedan saltarse RLS
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'financial_app_gateway') then
    create role financial_app_gateway
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  else
    alter role financial_app_gateway
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end
$$;

grant usage on schema financial_app to financial_app_gateway;

-- -----------------------------------------------------------------------------
-- 2. Contexto de tenant leído desde una GUC privada establecida por el gateway
-- -----------------------------------------------------------------------------
create or replace function financial_app.current_workspace_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_value text;
begin
  v_value := pg_catalog.current_setting('financial_app.workspace_id', true);
  if v_value is null or pg_catalog.btrim(v_value) = '' then
    return null;
  end if;
  begin
    return v_value::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

create or replace function financial_app.require_current_workspace_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := financial_app.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'workspace_context_required';
  end if;
  return v_workspace_id;
end;
$$;

revoke all on function financial_app.current_workspace_id() from public;
revoke all on function financial_app.require_current_workspace_id() from public;
grant execute on function financial_app.current_workspace_id() to financial_app_gateway;
grant execute on function financial_app.require_current_workspace_id() to financial_app_gateway;

-- -----------------------------------------------------------------------------
-- 3. Todas las entidades de negocio pasan a ownership obligatorio + RLS
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_missing bigint;
  v_policy text;
begin
  foreach v_table in array array[
    'account_source_mappings',
    'accounts',
    'audit_changes',
    'budgets',
    'categories',
    'categorization_rules',
    'document_transaction_associations',
    'documents',
    'forecast_items',
    'google_oauth_connections',
    'google_source_policy',
    'merchant_aliases',
    'merchants',
    'recurrences',
    'sync_cursors',
    'sync_issues',
    'sync_runs',
    'transaction_duplicate_reviews',
    'transaction_overrides',
    'transaction_source_records',
    'transactions'
  ] loop
    execute format('select count(*) from financial_app.%I where workspace_id is null', v_table)
      into v_missing;
    if v_missing <> 0 then
      raise exception 'pre001_workspace_backfill_incomplete_%', v_table;
    end if;

    execute format(
      'alter table financial_app.%I alter column workspace_id set default financial_app.require_current_workspace_id()',
      v_table
    );
    execute format(
      'alter table financial_app.%I alter column workspace_id set not null',
      v_table
    );

    execute format('alter table financial_app.%I enable row level security', v_table);
    execute format('alter table financial_app.%I force row level security', v_table);

    v_policy := v_table || '_workspace_isolation';
    execute format('drop policy if exists %I on financial_app.%I', v_policy, v_table);
    execute format(
      'create policy %I on financial_app.%I for all to financial_app_gateway using (workspace_id = financial_app.require_current_workspace_id()) with check (workspace_id = financial_app.require_current_workspace_id())',
      v_policy,
      v_table
    );

    execute format(
      'grant select, insert, update, delete on table financial_app.%I to financial_app_gateway',
      v_table
    );
    execute format(
      'create index if not exists %I on financial_app.%I(workspace_id)',
      v_table || '_workspace_idx',
      v_table
    );
  end loop;
end
$$;

-- El gateway sólo necesita leer membership antes de SET ROLE; esa lectura la realiza la
-- conexión de infraestructura, no el rol de negocio. No se concede escritura de membresías.
grant select on table financial_app.workspaces to financial_app_gateway;
grant select on table financial_app.workspace_memberships to financial_app_gateway;

-- -----------------------------------------------------------------------------
-- 4. Referencias compuestas: un UUID válido de otro workspace también debe fallar
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_parent_index text;
  v_constraint text;
begin
  for r in
    select
      c.conname,
      child.relname as child_table,
      parent.relname as parent_table,
      child_col.attname as child_column,
      parent_col.attname as parent_column
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join pg_attribute child_col
      on child_col.attrelid = c.conrelid and child_col.attnum = c.conkey[1]
    join pg_attribute parent_col
      on parent_col.attrelid = c.confrelid and parent_col.attnum = c.confkey[1]
    where c.contype = 'f'
      and child_ns.nspname = 'financial_app'
      and parent_ns.nspname = 'financial_app'
      and array_length(c.conkey, 1) = 1
      and child_col.attname <> 'workspace_id'
      and exists (
        select 1 from information_schema.columns x
        where x.table_schema='financial_app' and x.table_name=child.relname and x.column_name='workspace_id'
      )
      and exists (
        select 1 from information_schema.columns x
        where x.table_schema='financial_app' and x.table_name=parent.relname and x.column_name='workspace_id'
      )
  loop
    v_parent_index := r.parent_table || '_workspace_' || r.parent_column || '_unique';
    execute format(
      'create unique index if not exists %I on financial_app.%I(workspace_id,%I)',
      v_parent_index,
      r.parent_table,
      r.parent_column
    );

    v_constraint := r.child_table || '_' || r.child_column || '_workspace_fkey';
    if not exists (
      select 1
      from pg_constraint c2
      join pg_namespace n2 on n2.oid = c2.connamespace
      where n2.nspname='financial_app' and c2.conname=v_constraint
    ) then
      execute format(
        'alter table financial_app.%I add constraint %I foreign key (workspace_id,%I) references financial_app.%I(workspace_id,%I) on delete restrict not valid',
        r.child_table,
        v_constraint,
        r.child_column,
        r.parent_table,
        r.parent_column
      );
      execute format(
        'alter table financial_app.%I validate constraint %I',
        r.child_table,
        v_constraint
      );
    end if;
  end loop;
end
$$;

-- Marcador explícito de la invariancia que también usa la capa aditiva anterior.
-- workspace_reference_mismatch

-- -----------------------------------------------------------------------------
-- 5. Unicidades naturales por workspace
-- -----------------------------------------------------------------------------
drop index if exists financial_app.accounts_workspace_normalized_name_unique;
create unique index accounts_workspace_normalized_name_unique
  on financial_app.accounts(workspace_id, financial_app.normalize_label(name));

create unique index if not exists budgets_workspace_month_category_unique
  on financial_app.budgets(
    workspace_id,
    month,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create unique index if not exists categories_workspace_name_per_level_unique
  on financial_app.categories(
    workspace_id,
    kind,
    coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    financial_app.normalize_label(name)
  );

create unique index if not exists merchants_workspace_name_unique
  on financial_app.merchants(workspace_id, financial_app.normalize_label(normalized_name));

create unique index if not exists merchant_aliases_workspace_alias_unique
  on financial_app.merchant_aliases(workspace_id, financial_app.normalize_label(normalized_alias));

create unique index if not exists transaction_source_records_workspace_fingerprint_unique
  on financial_app.transaction_source_records(workspace_id, source_fingerprint);

create unique index if not exists transaction_source_records_workspace_row_fingerprint_unique
  on financial_app.transaction_source_records(workspace_id, source_row_identity, source_fingerprint);

drop index if exists financial_app.transactions_workspace_source_row_identity_unique;
create unique index transactions_workspace_source_row_identity_unique
  on financial_app.transactions(workspace_id, source_row_identity);

drop index if exists financial_app.documents_workspace_storage_identity_unique;
create unique index documents_workspace_storage_identity_unique
  on financial_app.documents(workspace_id, storage_provider, storage_key);

drop index if exists financial_app.documents_workspace_drive_file_identity_unique;
create unique index documents_workspace_drive_file_identity_unique
  on financial_app.documents(workspace_id, source_drive_file_id)
  where source_drive_file_id is not null;

create unique index if not exists forecast_items_workspace_projection_key_unique
  on financial_app.forecast_items(workspace_id, projection_key)
  where projection_key is not null;

create unique index if not exists forecast_items_workspace_idempotency_key_unique
  on financial_app.forecast_items(workspace_id, idempotency_key)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- 6. Funciones de previsión: upserts e idempotencia dentro del workspace
-- -----------------------------------------------------------------------------
create or replace function financial_app.save_manual_forecast_item(
  p_date date,
  p_concept text,
  p_amount_cents bigint,
  p_account_id uuid,
  p_category_id uuid,
  p_merchant_id uuid,
  p_confidence text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_row financial_app.forecast_items%rowtype;
  v_inserted boolean := false;
begin
  if p_date is null then raise exception 'invalid_forecast_date'; end if;
  if p_concept is null or btrim(p_concept) = '' or char_length(btrim(p_concept)) > 240 then
    raise exception 'invalid_forecast_concept';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 or p_amount_cents < -9007199254740991 or p_amount_cents > 9007199254740991 then
    raise exception 'invalid_forecast_amount';
  end if;
  if p_confidence not in ('high','medium','low') then raise exception 'invalid_forecast_confidence'; end if;
  if p_idempotency_key is null then raise exception 'invalid_forecast_idempotency_key'; end if;

  if p_account_id is not null and not exists (
    select 1 from financial_app.accounts where workspace_id=v_workspace_id and id=p_account_id
  ) then raise exception 'forecast_account_not_found'; end if;
  if p_category_id is not null and not exists (
    select 1 from financial_app.categories where workspace_id=v_workspace_id and id=p_category_id
  ) then raise exception 'forecast_category_not_found'; end if;
  if p_merchant_id is not null and not exists (
    select 1 from financial_app.merchants where workspace_id=v_workspace_id and id=p_merchant_id
  ) then raise exception 'forecast_merchant_not_found'; end if;

  insert into financial_app.forecast_items(
    workspace_id,date,account_id,category_id,merchant_id,concept,amount_cents,
    origin,confidence,excluded,projection_key,excluded_reason,reconciliation_note,idempotency_key
  ) values (
    v_workspace_id,p_date,p_account_id,p_category_id,p_merchant_id,btrim(p_concept),p_amount_cents,
    'manual',p_confidence,false,null,'','',p_idempotency_key
  )
  on conflict (workspace_id, idempotency_key) where idempotency_key is not null do nothing
  returning * into v_row;

  if found then
    v_inserted := true;
  else
    select * into v_row
    from financial_app.forecast_items
    where workspace_id=v_workspace_id and idempotency_key=p_idempotency_key;
    if not found then raise exception 'forecast_idempotency_conflict'; end if;
  end if;

  if v_row.origin is distinct from 'manual'
    or v_row.date is distinct from p_date
    or v_row.concept is distinct from btrim(p_concept)
    or v_row.amount_cents is distinct from p_amount_cents
    or v_row.account_id is distinct from p_account_id
    or v_row.category_id is distinct from p_category_id
    or v_row.merchant_id is distinct from p_merchant_id
    or v_row.confidence is distinct from p_confidence
  then
    raise exception 'forecast_idempotency_conflict';
  end if;

  if v_inserted then
    insert into financial_app.audit_changes(
      workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin
    ) values (
      v_workspace_id,'forecast',v_row.id,'created',null,
      jsonb_build_object('date',v_row.date,'amountCents',v_row.amount_cents,'concept',v_row.concept),
      'user'
    );
  end if;

  return to_jsonb(v_row) || jsonb_build_object(
    'idempotencyKey',v_row.idempotency_key,
    'updatedAt',v_row.updated_at
  );
end;
$$;

create or replace function financial_app.refresh_recurring_forecast(
  p_date_from date,
  p_date_to date,
  p_account_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  r record;
  v_occurrence date;
  v_step interval;
  v_key text;
  v_generated_keys text[] := array[]::text[];
  v_generated integer := 0;
  v_superseded integer := 0;
  v_guard integer;
begin
  perform financial_app.validate_forecast_range(p_date_from,p_date_to);

  if p_account_id is not null and not exists (
    select 1 from financial_app.accounts where workspace_id=v_workspace_id and id=p_account_id
  ) then raise exception 'forecast_account_not_found'; end if;

  for r in
    select id,account_id,category_id,merchant_id,concept_pattern,
           interval_unit,interval_count,usual_amount_cents,next_estimated_date,confidence
    from financial_app.recurrences
    where workspace_id=v_workspace_id
      and status='active'
      and next_estimated_date is not null
      and (p_account_id is null or account_id=p_account_id)
    order by id
  loop
    v_occurrence := r.next_estimated_date;
    v_step := financial_app.forecast_interval_step(r.interval_unit,r.interval_count);
    v_guard := 0;

    while v_occurrence < p_date_from loop
      v_occurrence := (v_occurrence::timestamp + v_step)::date;
      v_guard := v_guard + 1;
      if v_guard > 10000 then raise exception 'forecast_projection_guard'; end if;
    end loop;

    while v_occurrence <= p_date_to loop
      v_key := format('recurrence:%s:%s',r.id,v_occurrence);
      v_generated_keys := array_append(v_generated_keys,v_key);

      insert into financial_app.forecast_items(
        workspace_id,date,account_id,category_id,merchant_id,concept,amount_cents,
        origin,confidence,recurrence_id,budget_id,confirmed_transaction_id,
        excluded,projection_key,excluded_reason,reconciliation_note
      ) values (
        v_workspace_id,v_occurrence,r.account_id,r.category_id,r.merchant_id,
        r.concept_pattern,r.usual_amount_cents,'recurring',r.confidence,
        r.id,null,null,false,v_key,'',''
      )
      on conflict (workspace_id, projection_key) where projection_key is not null
      do update set
        date=excluded.date,
        account_id=excluded.account_id,
        category_id=excluded.category_id,
        merchant_id=excluded.merchant_id,
        concept=excluded.concept,
        amount_cents=excluded.amount_cents,
        origin='recurring',
        confidence=excluded.confidence,
        recurrence_id=excluded.recurrence_id,
        excluded=case
          when forecast_items.excluded_reason='Proyección recurrente sustituida al recalcular' then false
          else forecast_items.excluded
        end,
        excluded_reason=case
          when forecast_items.excluded_reason='Proyección recurrente sustituida al recalcular' then ''
          else forecast_items.excluded_reason
        end;

      v_generated := v_generated + 1;
      v_occurrence := (v_occurrence::timestamp + v_step)::date;
      v_guard := v_guard + 1;
      if v_guard > 10000 then raise exception 'forecast_projection_guard'; end if;
    end loop;
  end loop;

  update financial_app.forecast_items fi
  set excluded=true,
      excluded_reason=case
        when fi.excluded_reason='' then 'Proyección recurrente sustituida al recalcular'
        else fi.excluded_reason
      end
  where fi.workspace_id=v_workspace_id
    and fi.origin='recurring'
    and fi.confirmed_transaction_id is null
    and fi.date between p_date_from and p_date_to
    and (p_account_id is null or fi.account_id=p_account_id)
    and (fi.projection_key is null or not (fi.projection_key=any(v_generated_keys)));
  get diagnostics v_superseded = row_count;

  return jsonb_build_object(
    'generated',v_generated,
    'superseded',v_superseded,
    'dateFrom',p_date_from,
    'dateTo',p_date_to,
    'accountId',p_account_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Documentos: SECURITY INVOKER + identidad de almacenamiento por workspace
-- -----------------------------------------------------------------------------
alter function financial_app.confirm_document_transaction(uuid,uuid,text) security invoker;
alter function financial_app.document_detail(uuid) security invoker;
alter function financial_app.document_list(text,text,integer,integer) security invoker;
alter function financial_app.document_transaction_candidates(uuid,integer,integer) security invoker;
alter function financial_app.remove_document_transaction(uuid,uuid) security invoker;
alter function financial_app.set_document_status(uuid,text) security invoker;
alter function financial_app.update_document_metadata(uuid,text,date,text,bigint,text) security invoker;

create or replace function financial_app.register_document(
  p_type text,
  p_original_file_name text,
  p_mime_type text,
  p_storage_provider text,
  p_storage_key text,
  p_source_drive_file_id text default null,
  p_size_bytes bigint default null,
  p_source_modified_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_id uuid;
begin
  if p_type not in ('ticket','invoice','other') then raise exception 'invalid_document_type'; end if;
  if p_storage_provider not in ('supabase','google_drive') then raise exception 'invalid_document_storage_provider'; end if;
  if p_original_file_name is null or char_length(trim(p_original_file_name)) not between 1 and 500 then raise exception 'invalid_document_file_name'; end if;
  if p_mime_type is null or char_length(trim(p_mime_type)) not between 1 and 200 then raise exception 'invalid_document_mime_type'; end if;
  if p_storage_key is null or char_length(trim(p_storage_key)) not between 1 and 1000 then raise exception 'invalid_document_storage_key'; end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 9007199254740991) then raise exception 'invalid_document_size'; end if;
  if p_storage_provider='google_drive' and (p_source_drive_file_id is null or trim(p_source_drive_file_id)='') then raise exception 'invalid_document_drive_file_id'; end if;
  if p_storage_provider='supabase' and p_source_drive_file_id is not null then raise exception 'invalid_document_drive_file_id'; end if;

  insert into financial_app.documents(
    workspace_id,type,status,original_file_name,mime_type,storage_provider,storage_key,
    source_drive_file_id,size_bytes,source_modified_at
  ) values (
    v_workspace_id,p_type,'imported',trim(p_original_file_name),trim(p_mime_type),
    p_storage_provider,trim(p_storage_key),nullif(trim(coalesce(p_source_drive_file_id,'')),''),
    p_size_bytes,p_source_modified_at
  )
  on conflict (workspace_id, storage_provider, storage_key) do update
  set original_file_name=excluded.original_file_name,
      mime_type=excluded.mime_type,
      source_drive_file_id=excluded.source_drive_file_id,
      size_bytes=excluded.size_bytes,
      source_modified_at=excluded.source_modified_at,
      updated_at=now()
  returning id into v_id;

  return financial_app.document_detail(v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Google OAuth: Vault sigue privilegiado, pero cada función DEFiner exige workspace
-- -----------------------------------------------------------------------------
-- Estas funciones conservan SECURITY DEFINER exclusivamente porque necesitan Vault.
-- El ownership nunca se deriva de metadata del JWT: lo fija el gateway tras getUser().

create or replace function financial_app.store_google_oauth_connection(
  p_google_subject text,
  p_account_email text,
  p_refresh_token text,
  p_scopes text[],
  p_source_file_id text,
  p_source_file_name text
) returns table(connection_id boolean, refresh_token_secret_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_previous_secret_id uuid;
  v_new_secret_id uuid;
  v_allowed_email text;
  v_expected_scopes text[] := array[
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ]::text[];
begin
  if btrim(coalesce(p_google_subject,''))=''
     or btrim(coalesce(p_account_email,''))=''
     or btrim(coalesce(p_refresh_token,''))=''
     or btrim(coalesce(p_source_file_id,''))=''
     or btrim(coalesce(p_source_file_name,''))='' then
    raise exception 'invalid_google_oauth_connection';
  end if;

  if p_scopes is null or cardinality(p_scopes)<>2
     or not (p_scopes @> v_expected_scopes and p_scopes <@ v_expected_scopes) then
    raise exception 'invalid_google_oauth_scopes';
  end if;

  select p.allowed_email into v_allowed_email
  from financial_app.google_source_policy p
  where p.workspace_id=v_workspace_id and p.id=true;
  if v_allowed_email is null then raise exception 'google_oauth_policy_not_configured'; end if;
  if lower(btrim(p_account_email)) <> v_allowed_email then raise exception 'google_account_not_allowed'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.google_oauth_connection:' || v_workspace_id::text)
  );

  select c.refresh_token_secret_id into v_previous_secret_id
  from financial_app.google_oauth_connections c
  where c.workspace_id=v_workspace_id and c.id=true
  for update;

  if v_previous_secret_id is not null then
    delete from vault.secrets where id=v_previous_secret_id;
  end if;

  v_new_secret_id := vault.create_secret(
    p_refresh_token,
    'financial_app_google_refresh_token_' || v_workspace_id::text,
    'Financial App Google OAuth refresh token for workspace ' || v_workspace_id::text,
    null
  );

  insert into financial_app.google_oauth_connections(
    workspace_id,id,google_subject,account_email,refresh_token_secret_id,scopes,
    source_file_id,source_file_name,connected_at,last_verified_at
  ) values (
    v_workspace_id,true,btrim(p_google_subject),lower(btrim(p_account_email)),v_new_secret_id,
    v_expected_scopes,btrim(p_source_file_id),btrim(p_source_file_name),now(),now()
  )
  on conflict (workspace_id, id) do update set
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
  select true,c.google_subject,c.account_email,c.scopes,c.source_file_id,c.source_file_name,
         c.connected_at,c.last_verified_at,c.updated_at
  from financial_app.google_oauth_connections c
  where c.workspace_id=financial_app.require_current_workspace_id() and c.id=true;
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
  where c.workspace_id=financial_app.require_current_workspace_id() and c.id=true;
$$;

create or replace function financial_app.mark_google_oauth_verified()
returns void
language sql
security definer
set search_path = ''
as $$
  update financial_app.google_oauth_connections
  set last_verified_at=now(),updated_at=now()
  where workspace_id=financial_app.require_current_workspace_id() and id=true;
$$;

create or replace function financial_app.disconnect_google_oauth_connection()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_secret_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('financial_app.google_oauth_connection:' || v_workspace_id::text)
  );

  select refresh_token_secret_id into v_secret_id
  from financial_app.google_oauth_connections
  where workspace_id=v_workspace_id and id=true
  for update;

  if v_secret_id is null then return false; end if;

  delete from financial_app.google_oauth_connections
  where workspace_id=v_workspace_id and id=true;
  delete from vault.secrets where id=v_secret_id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Sustitución de PK/índices globales que impedirían tenants independientes
-- -----------------------------------------------------------------------------
-- Primero existen las variantes workspace-scoped y las funciones ya usan sus targets.

alter table financial_app.account_source_mappings
  drop constraint if exists account_source_mappings_pkey;
drop index if exists financial_app.account_source_mappings_pkey;
alter table financial_app.account_source_mappings
  add constraint account_source_mappings_pkey
  primary key (workspace_id,source_file_id,account_external_key);

alter table financial_app.sync_cursors
  drop constraint if exists sync_cursors_pkey;
drop index if exists financial_app.sync_cursors_pkey;
alter table financial_app.sync_cursors
  add constraint sync_cursors_pkey
  primary key (workspace_id,source_file_id,source_sheet_id);

alter table financial_app.google_oauth_connections
  drop constraint if exists google_oauth_connections_pkey;
drop index if exists financial_app.google_oauth_connections_pkey;
alter table financial_app.google_oauth_connections
  add constraint google_oauth_connections_pkey primary key (workspace_id,id);

alter table financial_app.google_source_policy
  drop constraint if exists google_source_policy_pkey;
drop index if exists financial_app.google_source_policy_pkey;
alter table financial_app.google_source_policy
  add constraint google_source_policy_pkey primary key (workspace_id,id);

-- Índices naturales globales: se retiran sólo después de tener equivalentes por workspace.
drop index if exists financial_app.accounts_unique_normalized_name;
drop index if exists financial_app.budgets_unique_month_category;
drop index if exists financial_app.categories_unique_normalized_name_per_level;
drop index if exists financial_app.merchant_aliases_unique_normalized_alias;
drop index if exists financial_app.merchants_unique_name;
drop index if exists financial_app.transaction_source_records_row_fingerprint_idx;
drop index if exists financial_app.transaction_source_records_unique_fingerprint;

alter table financial_app.transactions
  drop constraint if exists transactions_source_row_identity_key;
drop index if exists financial_app.transactions_source_row_identity_key;

drop index if exists financial_app.documents_drive_file_id_unique_idx;
drop index if exists financial_app.documents_storage_identity_idx;
drop index if exists financial_app.forecast_items_projection_key_unique;
drop index if exists financial_app.forecast_items_idempotency_key_unique;

-- -----------------------------------------------------------------------------
-- 10. Ejecución de funciones: sólo el rol interno puede alcanzar las superficies sensibles
-- -----------------------------------------------------------------------------
grant execute on all functions in schema financial_app to financial_app_gateway;

revoke all on function financial_app.confirm_document_transaction(uuid,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.document_detail(uuid) from public, anon, authenticated;
revoke all on function financial_app.document_list(text,text,integer,integer) from public, anon, authenticated;
revoke all on function financial_app.document_transaction_candidates(uuid,integer,integer) from public, anon, authenticated;
revoke all on function financial_app.register_document(text,text,text,text,text,text,bigint,timestamptz) from public, anon, authenticated;
revoke all on function financial_app.remove_document_transaction(uuid,uuid) from public, anon, authenticated;
revoke all on function financial_app.set_document_status(uuid,text) from public, anon, authenticated;
revoke all on function financial_app.update_document_metadata(uuid,text,date,text,bigint,text) from public, anon, authenticated;

revoke all on function financial_app.store_google_oauth_connection(text,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function financial_app.get_google_oauth_connection_status() from public, anon, authenticated;
revoke all on function financial_app.get_google_oauth_refresh_token() from public, anon, authenticated;
revoke all on function financial_app.mark_google_oauth_verified() from public, anon, authenticated;
revoke all on function financial_app.disconnect_google_oauth_connection() from public, anon, authenticated;

-- La membresía sigue siendo una frontera de autenticación separada y no queda expuesta.
revoke all on table financial_app.workspaces from anon, authenticated;
revoke all on table financial_app.workspace_memberships from anon, authenticated;
