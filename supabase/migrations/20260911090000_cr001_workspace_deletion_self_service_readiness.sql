-- Financial App · CR-001D · readiness del autoservicio de borrado
-- El endpoint de autoservicio ya existe en código, pero esta migración NO activa el borrado.
-- canExecute sólo puede ser true cuando coinciden: intent confirmado y fresco + política
-- comercial configurada + activación aprobada. Production permanece fail-closed mientras
-- workspace_deletion_runtime_policy.execution_enabled=false.

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
  v_policy financial_app.workspace_deletion_runtime_policy%rowtype;
  v_policy_found boolean := false;
  v_policy_configured boolean := false;
  v_execution_enabled boolean := false;
  v_effective_status text;
  v_confirmed_fresh boolean := false;
  v_intent_json jsonb := null;
begin
  v_impact := financial_app.workspace_deletion_impact();

  select * into v_policy
  from financial_app.workspace_deletion_runtime_policy
  where id=true;

  if found then
    v_policy_found := true;
    v_policy_configured :=
      v_policy.policy_version is not null
      and btrim(v_policy.policy_version) <> ''
      and v_policy.deletion_receipt_retention_days is not null
      and v_policy.retention_approved_at is not null;
    v_execution_enabled :=
      v_policy.execution_enabled
      and v_policy_configured
      and v_policy.activation_approved_at is not null;
  end if;

  select * into v_intent
  from financial_app.workspace_deletion_intents
  where workspace_id=v_workspace_id
  order by created_at desc,id desc
  limit 1;

  if found then
    v_effective_status := v_intent.status;
    if v_intent.status in ('prepared','confirmed') and v_intent.expires_at <= now() then
      v_effective_status := 'expired';
    end if;
    v_confirmed_fresh := v_effective_status='confirmed';
    v_intent_json := pg_catalog.jsonb_build_object(
      'intentId',v_intent.id,
      'status',v_intent.status,
      'effectiveStatus',v_effective_status,
      'createdAt',v_intent.created_at,
      'confirmedAt',v_intent.confirmed_at,
      'expiresAt',v_intent.expires_at,
      'confirmedAndFresh',v_confirmed_fresh
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion',3,
    'action','workspace_delete_readiness',
    'workspaceId',v_workspace_id,
    'actorRequirement','owner',
    'canExecute',(v_execution_enabled and v_confirmed_fresh),
    'destructiveOperationExecuted',false,
    'intent',v_intent_json,
    'impact',v_impact,
    'runtimeFoundation',pg_catalog.jsonb_build_object(
      'localExecutorImplemented',true,
      'runtimeOrchestratorImplemented',true,
      'commercialPolicyConfigured',v_policy_configured,
      'productionActivated',v_execution_enabled,
      'selfServiceExecutionEndpointExposed',true,
      'directGatewayDeleteOnBankSourceAllowed',false,
      'requiresApprovedReceiptRetention',true
    ),
    'preservedExternalSources',pg_catalog.jsonb_build_object(
      'officialBankSource','untouched',
      'googleDriveFiles','untouched'
    ),
    'validatedControls',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code','supabase_storage_runtime_cleanup_validated',
        'validated',true,
        'scope','isolated_local_storage_api',
        'productionMutationTested',false
      ),
      pg_catalog.jsonb_build_object(
        'code','workspace_deletion_local_executor_implemented',
        'validated',true,
        'commerciallyEnabled',v_execution_enabled
      ),
      pg_catalog.jsonb_build_object(
        'code','workspace_deletion_self_service_endpoint_exposed',
        'validated',true,
        'destructiveByDefault',false
      )
    ),
    'blockers',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code','workspace_deletion_intent_not_confirmed',
        'resolved',v_confirmed_fresh
      ),
      pg_catalog.jsonb_build_object(
        'code','deletion_runtime_policy_missing',
        'resolved',v_policy_found
      ),
      pg_catalog.jsonb_build_object(
        'code','post_deletion_receipt_retention_policy_not_defined',
        'resolved',v_policy_configured
      ),
      pg_catalog.jsonb_build_object(
        'code','production_activation_not_approved',
        'resolved',v_execution_enabled
      ),
      pg_catalog.jsonb_build_object(
        'code','self_service_execution_endpoint_not_exposed',
        'resolved',true
      )
    )
  );
end;
$$;

comment on function financial_app.workspace_deletion_readiness() is
  'CR-001D activation-aware readiness for the fail-closed self-service deletion endpoint. canExecute requires both confirmed intent and explicitly approved runtime policy.';

revoke all on function financial_app.workspace_deletion_readiness() from public,anon,authenticated,service_role;
grant execute on function financial_app.workspace_deletion_readiness() to financial_app_gateway;
