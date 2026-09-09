-- Financial App · PRE-001 · tenancy substrate (fase aditiva)
-- Esta migración NO activa todavía el aislamiento estricto ni elimina constraints legacy.
-- Su objetivo es crear la raíz workspace, backfillear de forma determinista el tenant personal
-- y preparar claves workspace-scoped sin romper Financial App 10.0.1 durante la transición.

create table if not exists financial_app.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_check check (char_length(trim(name)) between 1 and 120)
);

create table if not exists financial_app.workspace_memberships (
  workspace_id uuid not null references financial_app.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_memberships_role_check check (role in ('owner','member'))
);

create unique index if not exists workspace_memberships_one_default_per_user
  on financial_app.workspace_memberships(user_id)
  where active = true and is_default = true;

-- Tablas de negocio que pertenecen a un workspace. schema_meta y authorized_users
-- siguen siendo globales: la primera describe la instancia y la segunda es la allowlist de plataforma.
do $$
declare
  v_table text;
  v_constraint text;
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
    execute format('alter table financial_app.%I add column if not exists workspace_id uuid', v_table);
    v_constraint := v_table || '_workspace_id_fkey';
    if not exists (
      select 1
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'financial_app' and c.conname = v_constraint
    ) then
      execute format(
        'alter table financial_app.%I add constraint %I foreign key (workspace_id) references financial_app.workspaces(id) on delete restrict not valid',
        v_table,
        v_constraint
      );
    end if;
  end loop;
end
$$;

-- pre001_personal_workspace_backfill
-- La instancia existente sólo puede backfillearse automáticamente cuando hay exactamente
-- un usuario activo autorizado. Si no se cumple, se falla cerrado en vez de adivinar ownership.
do $$
declare
  v_personal_workspace constant uuid := '00000000-0000-4000-8000-000000000101'::uuid;
  v_active_users integer;
  v_has_personal_data boolean;
  v_table text;
begin
  select count(*)::integer
    into v_active_users
  from financial_app.authorized_users
  where active = true;

  select exists(select 1 from financial_app.accounts limit 1)
      or exists(select 1 from financial_app.transactions limit 1)
      or exists(select 1 from financial_app.transaction_source_records limit 1)
      or exists(select 1 from financial_app.documents limit 1)
    into v_has_personal_data;

  if v_has_personal_data and v_active_users <> 1 then
    raise exception 'pre001_personal_workspace_backfill_requires_single_authorized_user';
  end if;

  if v_active_users = 1 then
    insert into financial_app.workspaces(id, name)
    values (v_personal_workspace, 'Personal')
    on conflict (id) do update
      set updated_at = now();

    insert into financial_app.workspace_memberships(
      workspace_id, user_id, role, active, is_default
    )
    select v_personal_workspace, user_id, 'owner', true, true
    from financial_app.authorized_users
    where active = true
    on conflict (workspace_id, user_id) do update
      set role = 'owner',
          active = true,
          is_default = true,
          updated_at = now();

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
      -- La fuente bancaria sigue siendo inmutable para runtime. La única excepción es este
      -- backfill administrativo de ownership; PostgreSQL revierte el DISABLE si el bloque falla.
      if v_table = 'transaction_source_records' then
        execute 'alter table financial_app.transaction_source_records disable trigger transaction_source_records_no_update';
      end if;

      execute format(
        'update financial_app.%I set workspace_id = $1 where workspace_id is null',
        v_table
      ) using v_personal_workspace;

      if v_table = 'transaction_source_records' then
        execute 'alter table financial_app.transaction_source_records enable trigger transaction_source_records_no_update';
      end if;
    end loop;

    if not exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'financial_app'
        and c.relname = 'transaction_source_records'
        and t.tgname = 'transaction_source_records_no_update'
        and t.tgenabled = 'O'
        and not t.tgisinternal
    ) then
      raise exception 'pre001_bank_source_update_trigger_not_enabled';
    end if;
  end if;
end
$$;

-- Primeras claves workspace-scoped. Las claves globales legacy permanecen temporalmente
-- para compatibilidad; PRE-001 hardening las sustituirá sólo después de que el gateway
-- propague identidad y todas las regresiones cross-tenant sean verdes.
create unique index if not exists accounts_workspace_normalized_name_unique
  on financial_app.accounts(workspace_id, lower(btrim(name)))
  where workspace_id is not null;

create unique index if not exists transactions_workspace_source_row_identity_unique
  on financial_app.transactions(workspace_id, source_row_identity)
  where workspace_id is not null;

create unique index if not exists documents_workspace_storage_identity_unique
  on financial_app.documents(workspace_id, storage_provider, storage_key)
  where workspace_id is not null;

create unique index if not exists documents_workspace_drive_file_identity_unique
  on financial_app.documents(workspace_id, source_drive_file_id)
  where workspace_id is not null and source_drive_file_id is not null;

-- Se denomina *_pkey porque será la futura PK al retirar la PK legacy de dos columnas.
-- En esta fase es deliberadamente un índice UNIQUE paralelo para mantener compatibilidad.
create unique index if not exists sync_cursors_workspace_pkey
  on financial_app.sync_cursors(workspace_id, source_file_id, source_sheet_id)
  where workspace_id is not null;

create unique index if not exists account_source_mappings_workspace_identity_unique
  on financial_app.account_source_mappings(workspace_id, source_file_id, account_external_key)
  where workspace_id is not null;

create unique index if not exists google_oauth_connections_workspace_unique
  on financial_app.google_oauth_connections(workspace_id)
  where workspace_id is not null;

create unique index if not exists google_source_policy_workspace_unique
  on financial_app.google_source_policy(workspace_id)
  where workspace_id is not null;

-- Utilidad común para las siguientes fases de constraints compuestos y funciones.
-- Cualquier referencia explícita entre workspaces debe fallar cerrada con este código.
create or replace function financial_app.assert_workspace_reference(
  p_workspace_id uuid,
  p_reference_workspace_id uuid
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_workspace_id is null
     or p_reference_workspace_id is null
     or p_workspace_id is distinct from p_reference_workspace_id then
    raise exception 'workspace_reference_mismatch';
  end if;
end;
$$;

revoke all on table financial_app.workspaces from anon;
revoke all on table financial_app.workspace_memberships from anon;
revoke all on table financial_app.workspaces from authenticated;
revoke all on table financial_app.workspace_memberships from authenticated;
