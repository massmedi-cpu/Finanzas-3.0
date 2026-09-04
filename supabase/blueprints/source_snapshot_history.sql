begin;

alter table financial_app.transaction_source_records
  add column source_row_identity text,
  add column supersedes_source_record_id uuid references financial_app.transaction_source_records(id) on delete restrict;

update financial_app.transaction_source_records
set source_row_identity =
  btrim(source_file_id) || '::' || btrim(coalesce(source_sheet_id, '')) || '::' || btrim(source_row_key)
where source_row_identity is null;

alter table financial_app.transaction_source_records
  alter column source_row_identity set not null,
  add constraint transaction_source_records_row_identity_not_blank
    check (btrim(source_row_identity) <> ''),
  add constraint transaction_source_records_fingerprint_sha256
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint transaction_source_records_not_self_superseded
    check (supersedes_source_record_id is null or supersedes_source_record_id <> id);

drop index if exists financial_app.transaction_source_records_unique_row;

create index transaction_source_records_row_history_idx
  on financial_app.transaction_source_records (source_row_identity, imported_at desc, id desc);

create unique index transaction_source_records_row_fingerprint_idx
  on financial_app.transaction_source_records (source_row_identity, source_fingerprint);

comment on column financial_app.transaction_source_records.source_row_identity is
  'Stable identity of the external bank-source row across observations.';
comment on column financial_app.transaction_source_records.supersedes_source_record_id is
  'Previous immutable observation superseded by this externally corrected source snapshot.';

update financial_app.schema_meta
set schema_version = 2,
    updated_at = now()
where id = true;

commit;
