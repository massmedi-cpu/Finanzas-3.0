-- Financial App · PRE-020C · manifiesto no destructivo del impacto de borrado
-- Esta migración NO borra datos, NO elimina ficheros y NO modifica la fuente bancaria oficial.
-- Expone únicamente un inventario owner-only del workspace activo, bajo RLS.
-- El rol/membership count vienen de la frontera Edge resuelta antes de SET ROLE; esta función
-- no recupera acceso directo a workspace_memberships y permanece SECURITY INVOKER.

create or replace function financial_app.workspace_deletion_impact()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_role text := nullif(pg_catalog.current_setting('financial_app.workspace_role', true), '');
  v_membership_count_setting text := nullif(pg_catalog.current_setting('financial_app.workspace_membership_count', true), '');
  v_table text;
  v_count bigint;
  v_total_rows bigint := 0;
  v_row_counts jsonb := '{}'::jsonb;
  v_memberships bigint;
  v_supabase_documents bigint := 0;
  v_supabase_document_bytes bigint := 0;
  v_google_drive_references bigint := 0;
  v_oauth_connections bigint := 0;
begin
  if v_role is null or v_membership_count_setting is null then
    raise exception using errcode = '42501', message = 'workspace_membership_context_required';
  end if;

  if v_role <> 'owner' then
    raise exception using errcode = '42501', message = 'workspace_owner_required';
  end if;

  begin
    v_memberships := v_membership_count_setting::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '42501', message = 'workspace_membership_context_invalid';
  end;
  if v_memberships < 1 then
    raise exception using errcode = '42501', message = 'workspace_membership_context_invalid';
  end if;

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
    execute pg_catalog.format(
      'select count(*)::bigint from financial_app.%I where workspace_id = $1',
      v_table
    ) into v_count using v_workspace_id;

    v_row_counts := v_row_counts || pg_catalog.jsonb_build_object(v_table, v_count);
    v_total_rows := v_total_rows + v_count;
  end loop;

  select
    count(*)::bigint,
    coalesce(sum(d.size_bytes), 0)::bigint
    into v_supabase_documents, v_supabase_document_bytes
  from financial_app.documents d
  where d.workspace_id = v_workspace_id
    and d.storage_provider = 'supabase';

  select count(*)::bigint
    into v_google_drive_references
  from financial_app.documents d
  where d.workspace_id = v_workspace_id
    and d.storage_provider = 'google_drive';

  select count(*)::bigint
    into v_oauth_connections
  from financial_app.google_oauth_connections c
  where c.workspace_id = v_workspace_id;

  return pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'action', 'workspace_delete',
    'workspaceId', v_workspace_id,
    'actorRequirement', 'owner',
    'destructiveOperationExecuted', false,
    'rowCounts', v_row_counts,
    'summary', pg_catalog.jsonb_build_object(
      'workspaceRows', v_total_rows,
      'workspaceMemberships', v_memberships,
      'supabaseManagedDocuments', v_supabase_documents,
      'supabaseManagedDocumentBytes', v_supabase_document_bytes,
      'googleDriveDocumentReferences', v_google_drive_references,
      'oauthConnections', v_oauth_connections
    ),
    'effects', pg_catalog.jsonb_build_object(
      'localWorkspaceRows', 'would_be_deleted',
      'officialBankSource', 'untouched',
      'officialBankSourceLocalCopies', 'would_be_deleted',
      'googleDriveFiles', 'untouched',
      'supabaseManagedDocumentObjects', 'would_require_storage_cleanup_before_delete',
      'oauthRefreshTokenSecrets', 'would_require_vault_cleanup_before_delete'
    ),
    'blockers', pg_catalog.jsonb_build_array(
      'self_service_deletion_not_implemented',
      'storage_object_cleanup_not_implemented',
      'oauth_vault_cleanup_not_implemented',
      'production_activation_not_approved'
    )
  );
end;
$$;

comment on function financial_app.workspace_deletion_impact() is
  'PRE-020C read-only, owner-only deletion impact manifest. Role is resolved at the trusted Edge boundary; function stays SECURITY INVOKER and never mutates bank source or external Drive files.';

revoke all on function financial_app.workspace_deletion_impact() from public;
revoke all on function financial_app.workspace_deletion_impact() from anon;
revoke all on function financial_app.workspace_deletion_impact() from authenticated;
revoke all on function financial_app.workspace_deletion_impact() from service_role;
grant execute on function financial_app.workspace_deletion_impact() to financial_app_gateway;
