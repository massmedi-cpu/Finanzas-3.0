-- Financial App · PRE-020B · exportación estructurada del workspace
-- Export de datos de negocio bajo RLS. No incluye credenciales OAuth, allowlists,
-- secretos de Vault, metadatos de plataforma ni binarios de documentos.

create or replace function financial_app.export_current_workspace_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
begin
  return pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'format', 'financial-app-workspace-json',
    'workspaceId', v_workspace_id,
    'generatedAt', pg_catalog.statement_timestamp(),
    'locale', 'es-ES',
    'currency', 'EUR',
    'timeZone', 'Europe/Madrid',
    'limitations', pg_catalog.jsonb_build_array(
      'document_binaries_not_included',
      'oauth_credentials_not_included',
      'platform_access_controls_not_included',
      'vault_secrets_not_included'
    ),
    'datasets', pg_catalog.jsonb_build_object(
      'accounts', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.accounts t
      ), '[]'::jsonb),
      'accountSourceMappings', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.account_source_mappings t
      ), '[]'::jsonb),
      'categories', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.categories t
      ), '[]'::jsonb),
      'merchants', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.merchants t
      ), '[]'::jsonb),
      'merchantAliases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.merchant_aliases t
      ), '[]'::jsonb),
      'categorizationRules', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.categorization_rules t
      ), '[]'::jsonb),
      'transactionSourceRecords', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.transaction_source_records t
      ), '[]'::jsonb),
      'transactions', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.transactions t
      ), '[]'::jsonb),
      'transactionOverrides', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.transaction_overrides t
      ), '[]'::jsonb),
      'transactionDuplicateReviews', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.transaction_duplicate_reviews t
      ), '[]'::jsonb),
      'recurrences', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.recurrences t
      ), '[]'::jsonb),
      'budgets', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.budgets t
      ), '[]'::jsonb),
      'forecastItems', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.forecast_items t
      ), '[]'::jsonb),
      'documents', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.documents t
      ), '[]'::jsonb),
      'documentTransactionAssociations', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.document_transaction_associations t
      ), '[]'::jsonb),
      'syncRuns', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.sync_runs t
      ), '[]'::jsonb),
      'syncCursors', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.sync_cursors t
      ), '[]'::jsonb),
      'syncIssues', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.sync_issues t
      ), '[]'::jsonb),
      'auditChanges', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.audit_changes t
      ), '[]'::jsonb),
      'googleSourcePolicy', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'workspace_id' order by (pg_catalog.to_jsonb(t) - 'workspace_id')::text)
        from financial_app.google_source_policy t
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function financial_app.export_current_workspace_data() from public;
revoke all on function financial_app.export_current_workspace_data() from anon;
revoke all on function financial_app.export_current_workspace_data() from authenticated;
grant execute on function financial_app.export_current_workspace_data() to financial_app_gateway;
