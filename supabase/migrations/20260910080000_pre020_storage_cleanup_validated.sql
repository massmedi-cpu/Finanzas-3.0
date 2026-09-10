-- Financial App · PRE-020G · Storage runtime cleanup validado en Supabase local aislado.
-- Cambio acumulativo sobre PRE-020F: conserva readiness fail-closed y retira únicamente el blocker de Storage.
-- NO habilita executor destructivo ni cambia Production.

create or replace function financial_app.workspace_deletion_readiness()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_impact jsonb;
  v_intent financial_app.workspace_deletion_intents%rowtype;
  v_effective_status text;
  v_confirmed_fresh boolean := false;
  v_intent_json jsonb := null;
begin
  v_impact := financial_app.workspace_deletion_impact();

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where workspace_id = v_workspace_id
  order by created_at desc, id desc
  limit 1;

  if found then
    v_effective_status := v_intent.status;
    if v_intent.status in ('prepared','confirmed') and v_intent.expires_at <= now() then
      v_effective_status := 'expired';
    end if;
    v_confirmed_fresh := v_effective_status = 'confirmed';
    v_intent_json := pg_catalog.jsonb_build_object(
      'intentId', v_intent.id,
      'status', v_intent.status,
      'effectiveStatus', v_effective_status,
      'createdAt', v_intent.created_at,
      'confirmedAt', v_intent.confirmed_at,
      'expiresAt', v_intent.expires_at,
      'confirmedAndFresh', v_confirmed_fresh
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'action', 'workspace_delete_readiness',
    'workspaceId', v_workspace_id,
    'actorRequirement', 'owner',
    'canExecute', false,
    'destructiveOperationExecuted', false,
    'intent', v_intent_json,
    'impact', v_impact,
    'preservedExternalSources', pg_catalog.jsonb_build_object(
      'officialBankSource', 'untouched',
      'googleDriveFiles', 'untouched'
    ),
    'validatedControls', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'supabase_storage_runtime_cleanup_validated',
        'validated', true,
        'scope', 'isolated_local_storage_api',
        'productionMutationTested', false
      )
    ),
    'blockers', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'workspace_deletion_intent_not_confirmed',
        'resolved', v_confirmed_fresh
      ),
      pg_catalog.jsonb_build_object(
        'code', 'destructive_executor_not_implemented',
        'resolved', false
      ),
      pg_catalog.jsonb_build_object(
        'code', 'post_deletion_receipt_retention_policy_not_defined',
        'resolved', false
      ),
      pg_catalog.jsonb_build_object(
        'code', 'production_activation_not_approved',
        'resolved', false
      )
    )
  );
end;
$$;

comment on function financial_app.workspace_deletion_readiness() is
  'PRE-020G owner-only readiness. Storage cleanup validated in isolated local Storage API; still fail-closed and non-destructive at runtime.';

revoke all on function financial_app.workspace_deletion_readiness() from public;
revoke all on function financial_app.workspace_deletion_readiness() from anon;
revoke all on function financial_app.workspace_deletion_readiness() from authenticated;
revoke all on function financial_app.workspace_deletion_readiness() from service_role;
grant execute on function financial_app.workspace_deletion_readiness() to financial_app_gateway;
