\set ON_ERROR_STOP on
begin transaction read only;

do $$
declare
  v_count bigint;
  v_table text;
begin
  select count(*) into v_count from financial_app.authorized_users where active=true;
  if v_count <> 1 then raise exception 'backend_preflight_requires_exactly_one_active_authorized_user'; end if;

  select count(*) into v_count
  from financial_app.authorized_users a
  left join auth.users u on u.id=a.user_id
  where a.active=true and u.id is null;
  if v_count <> 0 then raise exception 'backend_preflight_authorized_user_missing_auth_identity'; end if;

  if pg_catalog.to_regrole('financial_app_gateway') is not null then
    raise exception 'backend_preflight_gateway_role_already_exists';
  end if;
  if pg_catalog.to_regclass('financial_app.workspaces') is not null
     or pg_catalog.to_regclass('financial_app.workspace_memberships') is not null
     or pg_catalog.to_regclass('financial_app.workspace_deletion_intents') is not null
     or pg_catalog.to_regclass('financial_app.workspace_deletion_runtime_policy') is not null
     or pg_catalog.to_regprocedure('financial_app.require_current_workspace_id()') is not null then
    raise exception 'backend_preflight_partial_workspace_alignment_detected';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='pre007_forecast_write_integrity'
  ) then raise exception 'backend_preflight_pre007_boundary_missing'; end if;

  if pg_catalog.to_regprocedure('financial_app.normalize_label(text)') is null
     or pg_catalog.to_regprocedure('financial_app.save_manual_forecast_item(date,text,bigint,uuid,uuid,uuid,text,uuid)') is null
     or pg_catalog.to_regprocedure('financial_app.set_forecast_item_excluded(uuid,boolean,text,timestamp with time zone)') is null
     or pg_catalog.to_regprocedure('financial_app.reconcile_forecast_item(uuid,uuid,text,timestamp with time zone)') is null then
    raise exception 'backend_preflight_expected_pre007_surface_missing';
  end if;

  select count(*) into v_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='financial_app'
    and c.relname='transaction_source_records'
    and not t.tgisinternal
    and t.tgname in ('transaction_source_records_no_delete','transaction_source_records_no_update')
    and t.tgenabled='O';
  if v_count <> 2 then raise exception 'backend_preflight_bank_immutability_triggers_not_enabled'; end if;

  select count(*) into v_count from (
    select lower(btrim(name)) from financial_app.accounts group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_accounts_name'; end if;

  select count(*) into v_count from (
    select source_row_identity from financial_app.transactions group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_transaction_source_identity'; end if;

  select count(*) into v_count from (
    select storage_provider,storage_key from financial_app.documents group by 1,2 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_document_storage_identity'; end if;

  select count(*) into v_count from (
    select source_drive_file_id from financial_app.documents
    where source_drive_file_id is not null group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_document_drive_identity'; end if;

  select count(*) into v_count from (
    select source_fingerprint from financial_app.transaction_source_records group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_source_fingerprint'; end if;

  select count(*) into v_count from (
    select source_row_identity,source_fingerprint from financial_app.transaction_source_records group by 1,2 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_source_row_fingerprint'; end if;

  select count(*) into v_count from (
    select month,coalesce(category_id,'00000000-0000-0000-0000-000000000000'::uuid)
    from financial_app.budgets group by 1,2 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_budget_identity'; end if;

  select count(*) into v_count from (
    select kind,coalesce(parent_category_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name))
    from financial_app.categories group by 1,2,3 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_category_identity'; end if;

  select count(*) into v_count from (
    select lower(btrim(normalized_name)) from financial_app.merchants group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_merchant_identity'; end if;

  select count(*) into v_count from (
    select lower(btrim(normalized_alias)) from financial_app.merchant_aliases group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_merchant_alias_identity'; end if;

  select count(*) into v_count from (
    select source_file_id,account_external_key from financial_app.account_source_mappings group by 1,2 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_account_source_mapping'; end if;

  select count(*) into v_count from (
    select source_file_id,source_sheet_id from financial_app.sync_cursors group by 1,2 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_sync_cursor'; end if;

  select count(*) into v_count from (
    select projection_key from financial_app.forecast_items where projection_key is not null group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_forecast_projection_key'; end if;

  select count(*) into v_count from (
    select idempotency_key from financial_app.forecast_items where idempotency_key is not null group by 1 having count(*)>1
  ) d;
  if v_count <> 0 then raise exception 'backend_preflight_duplicate_forecast_idempotency_key'; end if;
end
$$;

select 'FINANCIAL_APP_BACKEND_PREFLIGHT_OK' as status;
rollback;
