\set ON_ERROR_STOP on
begin transaction read only;

do $$
declare
  v_count bigint;
  v_total bigint;
  v_distinct bigint;
  v_table text;
  v_rel record;
  v_policy record;
  v_readiness_def text;
begin
  select count(*),count(distinct name)
    into v_total,v_distinct
  from supabase_migrations.schema_migrations;
  if v_total <> 58 or v_distinct <> 58 then
    raise exception 'backend_postflight_migration_boundary_invalid:%/%',v_total,v_distinct;
  end if;

  select count(*) into v_count
  from (values
    ('financial_app_foundations'),
    ('source_snapshot_history'),
    ('harden_function_search_paths'),
    ('index_foreign_keys'),
    ('enforce_category_child_kind'),
    ('enforce_category_lifecycle_hierarchy'),
    ('centralize_configuration_mutations'),
    ('harden_category_merge_concurrency'),
    ('phase2_incremental_source_ingestion'),
    ('sync_cursors_per_sheet'),
    ('google_oauth_vault_connection'),
    ('fix_google_oauth_vault_connection_shadowing'),
    ('recompute_duplicate_candidates_after_source_revision'),
    ('source_account_lifecycle'),
    ('disambiguate_source_account_mapping_overloads'),
    ('google_source_private_policy'),
    ('google_source_policy_explicit_deny'),
    ('phase3_merchant_alias_engine'),
    ('phase3_categorization_rule_engine'),
    ('phase4_effective_transaction_query_engine'),
    ('phase4_transaction_override_management'),
    ('phase4_duplicate_transfer_engine'),
    ('phase4_duplicate_transfer_hardening'),
    ('phase4_transfer_effective_kind_consistency'),
    ('phase5_financial_logic_core'),
    ('phase5_scope_balances_by_account'),
    ('phase5_explicit_archived_account_scope'),
    ('phase5_financial_facts_pushdown'),
    ('phase5_transfer_pair_count_consistency'),
    ('phase5_partial_date_range_consistency'),
    ('phase5_snapshot_range_consistency'),
    ('phase4_production_auth_allowlist'),
    ('phase4_production_auth_allowlist_rls'),
    ('phase4_production_auth_schema_execute_hardening'),
    ('phase6_budget_engine_core'),
    ('phase7_recurrence_engine_core'),
    ('phase7_recurrence_freshness'),
    ('phase7_server_resolved_candidate_persistence'),
    ('phase8_forecast_engine_core'),
    ('phase8_forecast_audit_contract'),
    ('phase8_reconciliation_candidates'),
    ('phase8_reactivate_system_superseded_forecasts'),
    ('phase8_nonzero_manual_forecasts'),
    ('phase9_document_engine_core'),
    ('phase9_document_candidate_order_fix'),
    ('optimize_authorized_users_rls_initplan'),
    ('pre007_forecast_write_integrity'),
    ('pre001_workspace_tenancy'),
    ('pre001_workspace_isolation'),
    ('pre001_workspace_fk_semantics'),
    ('pre001_function_surface_lockdown'),
    ('pre020_workspace_structured_export'),
    ('pre020_workspace_deletion_impact'),
    ('pre020_workspace_deletion_intent'),
    ('pre020_workspace_deletion_readiness'),
    ('pre020_storage_cleanup_validated'),
    ('cr001_workspace_deletion_local_executor'),
    ('cr001_workspace_deletion_readiness_alignment')
  ) expected(name)
  where not exists (
    select 1 from supabase_migrations.schema_migrations m where m.name=expected.name
  );
  if v_count <> 0 then raise exception 'backend_postflight_expected_migration_name_missing:%',v_count; end if;

  if pg_catalog.to_regrole('financial_app_gateway') is null then
    raise exception 'backend_postflight_gateway_role_missing';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname='financial_app_gateway' and rolbypassrls) then
    raise exception 'backend_postflight_gateway_role_bypasses_rls';
  end if;

  if pg_catalog.to_regclass('financial_app.workspaces') is null
     or pg_catalog.to_regclass('financial_app.workspace_memberships') is null
     or pg_catalog.to_regclass('financial_app.workspace_deletion_intents') is null
     or pg_catalog.to_regclass('financial_app.workspace_deletion_runtime_policy') is null
     or pg_catalog.to_regclass('financial_app.workspace_deletion_receipts') is null then
    raise exception 'backend_postflight_required_relations_missing';
  end if;

  if pg_catalog.to_regprocedure('financial_app.current_workspace_id()') is null
     or pg_catalog.to_regprocedure('financial_app.require_current_workspace_id()') is null
     or pg_catalog.to_regprocedure('financial_app.export_current_workspace_data()') is null
     or pg_catalog.to_regprocedure('financial_app.workspace_deletion_impact()') is null
     or pg_catalog.to_regprocedure('financial_app.workspace_deletion_readiness()') is null
     or pg_catalog.to_regprocedure('financial_app.begin_workspace_deletion_execution(uuid)') is null
     or pg_catalog.to_regprocedure('financial_app.record_workspace_deletion_external_cleanup(uuid,uuid,boolean,boolean)') is null
     or pg_catalog.to_regprocedure('financial_app.finalize_workspace_deletion_local(uuid,uuid)') is null then
    raise exception 'backend_postflight_required_function_surface_missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('financial_app.workspace_deletion_readiness()')
  ) into v_readiness_def;
  if v_readiness_def is null
     or pg_catalog.position('destructive_executor_not_implemented' in v_readiness_def) > 0
     or pg_catalog.position('workspace_deletion_local_executor_implemented' in v_readiness_def) = 0
     or pg_catalog.position('self_service_execution_endpoint_not_exposed' in v_readiness_def) = 0 then
    raise exception 'backend_postflight_deletion_readiness_not_aligned';
  end if;

  for v_table in select unnest(array[
    'account_source_mappings','accounts','audit_changes','budgets','categories',
    'categorization_rules','document_transaction_associations','documents','forecast_items',
    'google_oauth_connections','google_source_policy','merchant_aliases','merchants','recurrences',
    'sync_cursors','sync_issues','sync_runs','transaction_duplicate_reviews','transaction_overrides',
    'transaction_source_records','transactions'
  ]::text[])
  loop
    execute format('select count(*) from financial_app.%I where workspace_id is null',v_table) into v_count;
    if v_count <> 0 then raise exception 'backend_postflight_null_workspace_id:%',v_table; end if;

    select c.relrowsecurity,c.relforcerowsecurity into v_rel
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='financial_app' and c.relname=v_table;
    if not found or not v_rel.relrowsecurity or not v_rel.relforcerowsecurity then
      raise exception 'backend_postflight_rls_not_forced:%',v_table;
    end if;
  end loop;

  if pg_catalog.has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','UPDATE')
     or pg_catalog.has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','DELETE') then
    raise exception 'backend_postflight_gateway_bank_mutation_privilege_present';
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
  if v_count <> 2 then raise exception 'backend_postflight_bank_immutability_triggers_not_enabled'; end if;

  select * into v_policy from financial_app.workspace_deletion_runtime_policy where id=true;
  if not found then raise exception 'backend_postflight_deletion_policy_row_missing'; end if;
  if v_policy.execution_enabled
     or v_policy.policy_version is not null
     or v_policy.deletion_receipt_retention_days is not null
     or v_policy.retention_approved_at is not null
     or v_policy.activation_approved_at is not null then
    raise exception 'backend_postflight_deletion_policy_not_fail_closed';
  end if;

  select count(*) into v_count from financial_app.workspace_deletion_receipts;
  if v_count <> 0 then raise exception 'backend_postflight_unexpected_deletion_receipt'; end if;

  select count(*) into v_count
  from financial_app.workspace_memberships m
  join financial_app.authorized_users a on a.user_id=m.user_id and a.active=true
  where m.active=true and m.is_default=true and m.role='owner';
  if v_count <> 1 then raise exception 'backend_postflight_default_owner_membership_invalid'; end if;
end
$$;

select 'FINANCIAL_APP_BACKEND_POSTFLIGHT_OK' as status;
rollback;
