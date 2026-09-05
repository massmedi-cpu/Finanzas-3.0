alter table financial_app.transactions
  add column source_row_identity text;

update financial_app.transactions t
set source_row_identity = s.source_row_identity
from financial_app.transaction_source_records s
where s.id = t.source_record_id;

alter table financial_app.transactions
  alter column source_row_identity set not null;

create unique index transactions_source_row_identity_key
  on financial_app.transactions(source_row_identity);

comment on column financial_app.transactions.source_row_identity is
  'Stable logical identity of one bank movement across immutable source revisions.';

create table financial_app.account_source_mappings (
  source_file_id text not null,
  account_external_key text not null,
  account_id uuid not null references financial_app.accounts(id) on delete restrict,
  source_account_name text not null,
  source_identifier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_file_id, account_external_key),
  check (btrim(source_file_id) <> ''),
  check (btrim(account_external_key) <> ''),
  check (btrim(source_account_name) <> '')
);
create index account_source_mappings_account_idx
  on financial_app.account_source_mappings(account_id);

comment on table financial_app.account_source_mappings is
  'Read-side mapping from an immutable external bank account identity to a Financial App account.';

alter table financial_app.sync_runs
  add column rows_revised integer not null default 0 check (rows_revised >= 0),
  add column rows_failed integer not null default 0 check (rows_failed >= 0),
  add column warnings_count integer not null default 0 check (warnings_count >= 0),
  add column schema_fingerprint text check (schema_fingerprint is null or schema_fingerprint ~ '^[0-9a-f]{64}$');

create table financial_app.sync_issues (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references financial_app.sync_runs(id) on delete cascade,
  severity text not null check (severity in ('warning','error')),
  issue_code text not null,
  source_sheet_id text,
  source_row_key text,
  field_name text,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  check (btrim(issue_code) <> ''),
  check (btrim(message) <> '')
);
create index sync_issues_run_idx
  on financial_app.sync_issues(sync_run_id, severity, created_at, id);

comment on table financial_app.sync_issues is
  'Structured diagnostics for source-schema and row-quality problems. Importers must fail affected input instead of guessing.';

alter table financial_app.audit_changes
  add column change_origin text not null default 'user'
  check (change_origin in ('user','source_sync','system_rule'));

create trigger account_source_mappings_touch_updated_at
before update on financial_app.account_source_mappings
for each row execute function financial_app.touch_updated_at();

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
    from financial_app.accounts where lifecycle='active';

    insert into financial_app.accounts(
      name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
    ) values (
      btrim(p_account_name),nullif(btrim(coalesce(p_institution,'')),''),p_account_type,
      p_opening_balance_cents,'EUR','active',v_sort_order
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

create or replace function financial_app.refresh_duplicate_candidates(p_transaction_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_account_id uuid;
  v_bank_date date;
  v_amount_cents bigint;
  v_concept text;
begin
  select account_id,bank_date,amount_cents,concept_normalized
  into v_account_id,v_bank_date,v_amount_cents,v_concept
  from financial_app.transactions
  where id=p_transaction_id;

  if v_account_id is null then
    raise exception 'transaction_not_found';
  end if;

  update financial_app.transactions t
  set duplicate_state='suspected', updated_at=now()
  where t.id<>p_transaction_id
    and t.account_id=v_account_id
    and t.bank_date=v_bank_date
    and t.amount_cents=v_amount_cents
    and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(v_concept)
    and t.duplicate_state='none';
  get diagnostics v_count = row_count;

  if exists (
    select 1
    from financial_app.transactions t
    where t.id<>p_transaction_id
      and t.account_id=v_account_id
      and t.bank_date=v_bank_date
      and t.amount_cents=v_amount_cents
      and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(v_concept)
  ) then
    update financial_app.transactions
    set duplicate_state='suspected', updated_at=now()
    where id=p_transaction_id and duplicate_state='none';
    if found then
      v_count := v_count + 1;
    end if;
  end if;

  return v_count;
end;
$$;

create or replace function financial_app.ingest_source_observation(
  p_source_file_id text,
  p_source_sheet_id text,
  p_source_row_key text,
  p_source_row_identity text,
  p_source_fingerprint text,
  p_source_payload jsonb,
  p_bank_date date,
  p_concept_original text,
  p_concept_normalized text,
  p_amount_cents bigint,
  p_balance_after_cents bigint,
  p_account_external_key text,
  p_transaction_kind text,
  p_review_state text,
  p_imported_at timestamptz default now()
)
returns table(action text, source_record_id uuid, transaction_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_existing_source_id uuid;
  v_latest_source_id uuid;
  v_latest_payload jsonb;
  v_new_source_id uuid;
  v_transaction_id uuid;
  v_expected_identity text;
begin
  if p_source_payload is null or jsonb_typeof(p_source_payload) <> 'object' then
    raise exception 'invalid_source_payload';
  end if;
  if p_source_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_source_fingerprint';
  end if;
  if p_transaction_kind not in ('income','expense','transfer','refund','adjustment') then
    raise exception 'invalid_transaction_kind';
  end if;
  if p_review_state not in ('confirmed','pending','needs_review') then
    raise exception 'invalid_review_state';
  end if;

  v_expected_identity := btrim(p_source_file_id)||'::'||btrim(coalesce(p_source_sheet_id,''))||'::'||btrim(p_source_row_key);
  if p_source_row_identity <> v_expected_identity then
    raise exception 'source_row_identity_mismatch';
  end if;

  select account_id into v_account_id
  from financial_app.account_source_mappings
  where source_file_id=p_source_file_id
    and account_external_key=p_account_external_key;
  if v_account_id is null then
    raise exception 'source_account_unmapped';
  end if;

  select id into v_existing_source_id
  from financial_app.transaction_source_records
  where source_row_identity=p_source_row_identity
    and source_fingerprint=p_source_fingerprint
  limit 1;

  if v_existing_source_id is not null then
    select id into v_transaction_id
    from financial_app.transactions
    where source_row_identity=p_source_row_identity;

    action := 'skip';
    source_record_id := v_existing_source_id;
    transaction_id := v_transaction_id;
    return next;
    return;
  end if;

  select id,source_payload into v_latest_source_id,v_latest_payload
  from financial_app.transaction_source_records
  where source_row_identity=p_source_row_identity
  order by imported_at desc,id desc
  limit 1
  for update;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
    supersedes_source_record_id,source_payload,bank_date,concept_original,amount_cents,
    balance_after_cents,account_external_key,imported_at
  ) values (
    p_source_file_id,p_source_sheet_id,p_source_row_key,p_source_row_identity,p_source_fingerprint,
    v_latest_source_id,p_source_payload,p_bank_date,btrim(p_concept_original),p_amount_cents,
    p_balance_after_cents,p_account_external_key,p_imported_at
  ) returning id into v_new_source_id;

  select id into v_transaction_id
  from financial_app.transactions
  where source_row_identity=p_source_row_identity
  for update;

  if v_transaction_id is null then
    insert into financial_app.transactions(
      source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
      kind,amount_cents,balance_after_cents,review_state
    ) values (
      v_new_source_id,p_source_row_identity,v_account_id,p_bank_date,btrim(p_concept_normalized),
      p_transaction_kind,p_amount_cents,p_balance_after_cents,p_review_state
    ) returning id into v_transaction_id;
    action := 'insert';
  else
    update financial_app.transactions
    set source_record_id=v_new_source_id,
        account_id=v_account_id,
        bank_date=p_bank_date,
        concept_normalized=btrim(p_concept_normalized),
        kind=p_transaction_kind,
        amount_cents=p_amount_cents,
        balance_after_cents=p_balance_after_cents,
        review_state=p_review_state,
        updated_at=now()
    where id=v_transaction_id;

    insert into financial_app.audit_changes(
      entity_type,entity_id,field_name,original_value,new_value,change_origin
    ) values (
      'transaction',v_transaction_id,'source_revision',v_latest_payload,p_source_payload,'source_sync'
    );
    action := 'append_revision';
  end if;

  perform financial_app.refresh_duplicate_candidates(v_transaction_id);

  source_record_id := v_new_source_id;
  transaction_id := v_transaction_id;
  return next;
end;
$$;

revoke all on table financial_app.account_source_mappings from public, anon, authenticated;
revoke all on table financial_app.sync_issues from public, anon, authenticated;
grant select,insert,update,delete on table financial_app.account_source_mappings to service_role;
grant select,insert,update,delete on table financial_app.sync_issues to service_role;

revoke all on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function financial_app.refresh_duplicate_candidates(uuid) from public, anon, authenticated;
revoke all on function financial_app.ingest_source_observation(text,text,text,text,text,jsonb,date,text,text,bigint,bigint,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function financial_app.ensure_source_account_mapping(text,text,text,text,text,bigint,text) to service_role;
grant execute on function financial_app.refresh_duplicate_candidates(uuid) to service_role;
grant execute on function financial_app.ingest_source_observation(text,text,text,text,text,jsonb,date,text,text,bigint,bigint,text,text,text,timestamptz) to service_role;

update financial_app.schema_meta
set schema_version=3, updated_at=now()
where id=true;
