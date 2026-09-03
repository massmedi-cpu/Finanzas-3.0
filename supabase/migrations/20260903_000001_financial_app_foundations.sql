begin;

create schema if not exists financial_app;

comment on schema financial_app is
  'Financial App 10.0.0 rebuild. Dedicated application schema; bank source records are immutable.';

revoke all on schema financial_app from public;
revoke all on schema financial_app from anon;
revoke all on schema financial_app from authenticated;
grant usage on schema financial_app to service_role;

create or replace function financial_app.normalize_label(value text)
returns text
language sql
immutable
strict
as $$
  select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'));
$$;

create or replace function financial_app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table financial_app.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text,
  type text not null check (type in ('checking','savings','credit','cash','investment','other')),
  opening_balance_cents bigint not null check (opening_balance_cents between -9007199254740991 and 9007199254740991),
  currency text not null default 'EUR' check (currency = 'EUR'),
  lifecycle text not null default 'active' check (lifecycle in ('active','archived')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index accounts_unique_normalized_name
  on financial_app.accounts (financial_app.normalize_label(name));
create index accounts_order_idx on financial_app.accounts (lifecycle, sort_order, name);

create table financial_app.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense','transfer')),
  parent_category_id uuid references financial_app.categories(id) on delete restrict,
  icon_key text not null,
  color_token text not null,
  lifecycle text not null default 'active' check (lifecycle in ('active','archived')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_category_id is null or parent_category_id <> id)
);

create unique index categories_unique_normalized_name_per_level
  on financial_app.categories (
    kind,
    coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    financial_app.normalize_label(name)
  );
create index categories_order_idx on financial_app.categories (kind, parent_category_id, lifecycle, sort_order, name);

create or replace function financial_app.validate_category_parent()
returns trigger
language plpgsql
as $$
declare
  parent_kind text;
  cycle_found boolean;
begin
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

create trigger categories_validate_parent
before insert or update of parent_category_id, kind
on financial_app.categories
for each row execute function financial_app.validate_category_parent();

create table financial_app.merchants (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  default_category_id uuid references financial_app.categories(id) on delete set null,
  lifecycle text not null default 'active' check (lifecycle in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index merchants_unique_name on financial_app.merchants (financial_app.normalize_label(normalized_name));

create table financial_app.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references financial_app.merchants(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now()
);
create unique index merchant_aliases_unique_normalized_alias
  on financial_app.merchant_aliases (financial_app.normalize_label(normalized_alias));
create index merchant_aliases_merchant_idx on financial_app.merchant_aliases (merchant_id);

create table financial_app.transaction_source_records (
  id uuid primary key default gen_random_uuid(),
  source_file_id text not null,
  source_sheet_id text,
  source_row_key text not null,
  source_fingerprint text not null,
  source_payload jsonb not null,
  bank_date date not null,
  concept_original text not null,
  amount_cents bigint not null check (amount_cents between -9007199254740991 and 9007199254740991),
  balance_after_cents bigint check (balance_after_cents between -9007199254740991 and 9007199254740991),
  account_external_key text not null,
  imported_at timestamptz not null default now()
);

create unique index transaction_source_records_unique_row
  on financial_app.transaction_source_records (
    source_file_id,
    coalesce(source_sheet_id, ''),
    source_row_key
  );
create unique index transaction_source_records_unique_fingerprint
  on financial_app.transaction_source_records (source_fingerprint);
create index transaction_source_records_bank_date_idx
  on financial_app.transaction_source_records (bank_date desc, imported_at desc);

create or replace function financial_app.protect_bank_source_record()
returns trigger
language plpgsql
as $$
begin
  raise exception 'bank source records are immutable';
end;
$$;

create trigger transaction_source_records_no_update
before update on financial_app.transaction_source_records
for each row execute function financial_app.protect_bank_source_record();

create trigger transaction_source_records_no_delete
before delete on financial_app.transaction_source_records
for each row execute function financial_app.protect_bank_source_record();

create table financial_app.transactions (
  id uuid primary key default gen_random_uuid(),
  source_record_id uuid not null unique references financial_app.transaction_source_records(id) on delete restrict,
  account_id uuid not null references financial_app.accounts(id) on delete restrict,
  bank_date date not null,
  concept_normalized text not null,
  merchant_id uuid references financial_app.merchants(id) on delete set null,
  category_id uuid references financial_app.categories(id) on delete set null,
  kind text not null check (kind in ('income','expense','transfer','refund','adjustment')),
  amount_cents bigint not null check (amount_cents between -9007199254740991 and 9007199254740991),
  balance_after_cents bigint check (balance_after_cents between -9007199254740991 and 9007199254740991),
  review_state text not null default 'pending' check (review_state in ('confirmed','pending','needs_review')),
  duplicate_state text not null default 'none' check (duplicate_state in ('none','suspected','confirmed')),
  transfer_pair_id uuid references financial_app.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transfer_pair_id is null or transfer_pair_id <> id)
);
create index transactions_account_date_idx on financial_app.transactions (account_id, bank_date desc, id);
create index transactions_category_date_idx on financial_app.transactions (category_id, bank_date desc);
create index transactions_review_idx on financial_app.transactions (review_state, bank_date desc);
create index transactions_duplicate_idx on financial_app.transactions (duplicate_state, bank_date desc);

create table financial_app.transaction_overrides (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references financial_app.transactions(id) on delete cascade,
  concept_override text,
  merchant_id_override uuid references financial_app.merchants(id) on delete set null,
  merchant_override_set boolean not null default false,
  category_id_override uuid references financial_app.categories(id) on delete set null,
  category_override_set boolean not null default false,
  kind_override text check (kind_override is null or kind_override in ('income','expense','transfer','refund','adjustment')),
  excluded_from_analytics boolean not null default false,
  review_state_override text check (review_state_override is null or review_state_override in ('confirmed','pending','needs_review')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table financial_app.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  priority integer not null default 100 check (priority >= 0),
  concept_contains text,
  merchant_id uuid references financial_app.merchants(id) on delete set null,
  account_id uuid references financial_app.accounts(id) on delete set null,
  minimum_amount_cents bigint check (minimum_amount_cents between -9007199254740991 and 9007199254740991),
  maximum_amount_cents bigint check (maximum_amount_cents between -9007199254740991 and 9007199254740991),
  target_category_id uuid references financial_app.categories(id) on delete set null,
  target_merchant_id uuid references financial_app.merchants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    minimum_amount_cents is null
    or maximum_amount_cents is null
    or minimum_amount_cents <= maximum_amount_cents
  )
);
create index categorization_rules_priority_idx on financial_app.categorization_rules (status, priority, id);

create table financial_app.recurrences (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references financial_app.merchants(id) on delete set null,
  category_id uuid references financial_app.categories(id) on delete set null,
  account_id uuid references financial_app.accounts(id) on delete set null,
  concept_pattern text not null,
  status text not null default 'active' check (status in ('active','ignored','archived')),
  interval_unit text not null check (interval_unit in ('week','month','quarter','year')),
  interval_count integer not null check (interval_count > 0),
  usual_amount_cents bigint not null check (usual_amount_cents between -9007199254740991 and 9007199254740991),
  amount_tolerance_cents bigint not null default 0 check (amount_tolerance_cents between 0 and 9007199254740991),
  next_estimated_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table financial_app.budgets (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category_id uuid references financial_app.categories(id) on delete set null,
  automatic_amount_cents bigint not null check (automatic_amount_cents between -9007199254740991 and 9007199254740991),
  manual_amount_cents bigint check (manual_amount_cents between -9007199254740991 and 9007199254740991),
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index budgets_unique_month_category
  on financial_app.budgets (
    month,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table financial_app.forecast_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  account_id uuid references financial_app.accounts(id) on delete set null,
  category_id uuid references financial_app.categories(id) on delete set null,
  merchant_id uuid references financial_app.merchants(id) on delete set null,
  concept text not null,
  amount_cents bigint not null check (amount_cents between -9007199254740991 and 9007199254740991),
  origin text not null check (origin in ('known','recurring','budget','manual','inferred')),
  confidence text not null check (confidence in ('high','medium','low')),
  recurrence_id uuid references financial_app.recurrences(id) on delete set null,
  budget_id uuid references financial_app.budgets(id) on delete set null,
  confirmed_transaction_id uuid references financial_app.transactions(id) on delete set null,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forecast_items_date_idx on financial_app.forecast_items (date, excluded, id);

create table financial_app.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ticket','invoice','other')),
  status text not null check (status in ('imported','pending_review','confirmed','archived')),
  original_file_name text not null,
  mime_type text not null,
  storage_provider text not null check (storage_provider in ('supabase','google_drive')),
  storage_key text not null,
  source_drive_file_id text,
  document_date date,
  issuer_name text,
  total_cents bigint check (total_cents between -9007199254740991 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index documents_storage_identity_idx on financial_app.documents (storage_provider, storage_key);

create table financial_app.document_transaction_associations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references financial_app.documents(id) on delete cascade,
  transaction_id uuid not null references financial_app.transactions(id) on delete cascade,
  method text not null check (method in ('manual','suggested','automatic')),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, transaction_id)
);

create table financial_app.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_id text not null,
  source_revision text,
  status text not null check (status in ('started','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_seen integer not null default 0 check (rows_seen >= 0),
  rows_inserted integer not null default 0 check (rows_inserted >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  duplicates_detected integer not null default 0 check (duplicates_detected >= 0),
  error_code text,
  error_message text,
  check (finished_at is null or finished_at >= started_at)
);
create index sync_runs_source_started_idx on financial_app.sync_runs (source_file_id, started_at desc);

create table financial_app.sync_cursors (
  source_file_id text primary key,
  source_revision text,
  last_source_row_key text,
  last_successful_run_id uuid references financial_app.sync_runs(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table financial_app.audit_changes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('account','category','merchant','transaction','budget','recurrence','forecast','document','rule')),
  entity_id uuid not null,
  field_name text not null,
  original_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now()
);
create index audit_changes_entity_idx on financial_app.audit_changes (entity_type, entity_id, changed_at desc);

create table financial_app.schema_meta (
  id boolean primary key default true check (id = true),
  app_version text not null,
  target_version text not null,
  schema_version integer not null check (schema_version > 0),
  bank_source_policy text not null check (bank_source_policy = 'read_only'),
  locale text not null check (locale = 'es-ES'),
  currency text not null check (currency = 'EUR'),
  time_zone text not null check (time_zone = 'Europe/Madrid'),
  updated_at timestamptz not null default now()
);

insert into financial_app.schema_meta (
  id,
  app_version,
  target_version,
  schema_version,
  bank_source_policy,
  locale,
  currency,
  time_zone
) values (
  true,
  '0.0.1',
  '10.0.0',
  1,
  'read_only',
  'es-ES',
  'EUR',
  'Europe/Madrid'
)
on conflict (id) do update set
  app_version = excluded.app_version,
  target_version = excluded.target_version,
  schema_version = excluded.schema_version,
  bank_source_policy = excluded.bank_source_policy,
  locale = excluded.locale,
  currency = excluded.currency,
  time_zone = excluded.time_zone,
  updated_at = now();

create trigger accounts_touch_updated_at
before update on financial_app.accounts
for each row execute function financial_app.touch_updated_at();
create trigger categories_touch_updated_at
before update on financial_app.categories
for each row execute function financial_app.touch_updated_at();
create trigger merchants_touch_updated_at
before update on financial_app.merchants
for each row execute function financial_app.touch_updated_at();
create trigger transactions_touch_updated_at
before update on financial_app.transactions
for each row execute function financial_app.touch_updated_at();
create trigger transaction_overrides_touch_updated_at
before update on financial_app.transaction_overrides
for each row execute function financial_app.touch_updated_at();
create trigger categorization_rules_touch_updated_at
before update on financial_app.categorization_rules
for each row execute function financial_app.touch_updated_at();
create trigger recurrences_touch_updated_at
before update on financial_app.recurrences
for each row execute function financial_app.touch_updated_at();
create trigger budgets_touch_updated_at
before update on financial_app.budgets
for each row execute function financial_app.touch_updated_at();
create trigger forecast_items_touch_updated_at
before update on financial_app.forecast_items
for each row execute function financial_app.touch_updated_at();
create trigger documents_touch_updated_at
before update on financial_app.documents
for each row execute function financial_app.touch_updated_at();
create trigger document_associations_touch_updated_at
before update on financial_app.document_transaction_associations
for each row execute function financial_app.touch_updated_at();
create trigger sync_cursors_touch_updated_at
before update on financial_app.sync_cursors
for each row execute function financial_app.touch_updated_at();

revoke all on all tables in schema financial_app from anon;
revoke all on all tables in schema financial_app from authenticated;
revoke all on all sequences in schema financial_app from anon;
revoke all on all sequences in schema financial_app from authenticated;

grant select, insert, update, delete on all tables in schema financial_app to service_role;
grant usage, select on all sequences in schema financial_app to service_role;

-- The database itself also protects the official bank-source layer.
revoke update, delete on financial_app.transaction_source_records from service_role;

alter default privileges in schema financial_app revoke all on tables from anon;
alter default privileges in schema financial_app revoke all on tables from authenticated;
alter default privileges in schema financial_app grant select, insert, update, delete on tables to service_role;

commit;
