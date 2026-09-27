alter table financial_app.sync_runs
  add column if not exists rows_missing integer not null default 0;

alter table financial_app.sync_runs
  drop constraint if exists sync_runs_rows_missing_nonnegative;

alter table financial_app.sync_runs
  add constraint sync_runs_rows_missing_nonnegative check (rows_missing >= 0);
