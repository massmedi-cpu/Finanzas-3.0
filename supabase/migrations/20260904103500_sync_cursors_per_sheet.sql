alter table financial_app.sync_cursors
  add column source_sheet_id text;

update financial_app.sync_cursors
set source_sheet_id = '__legacy__'
where source_sheet_id is null;

alter table financial_app.sync_cursors
  alter column source_sheet_id set not null,
  add check (btrim(source_sheet_id) <> '');

alter table financial_app.sync_cursors
  drop constraint sync_cursors_pkey,
  add primary key (source_file_id, source_sheet_id);

comment on column financial_app.sync_cursors.source_sheet_id is
  'Independent cursor identity for each sheet inside one official source file.';

update financial_app.schema_meta
set schema_version = 4,
    updated_at = now()
where id = true;
