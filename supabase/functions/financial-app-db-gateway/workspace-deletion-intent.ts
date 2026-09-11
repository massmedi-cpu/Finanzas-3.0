import { cleanupWorkspaceStorage } from "./workspace-deletion-storage.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("workspace_owner_required")) return json({ error: "workspace_owner_required" }, 403);
  if (message.includes("workspace_deletion_intent_not_found")) return json({ error: "workspace_deletion_intent_not_found" }, 404);
  if (message.includes("workspace_deletion_confirmation_invalid")) return json({ error: "workspace_deletion_confirmation_invalid" }, 403);
  if (message.includes("workspace_deletion_execution_proof_invalid")) return json({ error: "workspace_deletion_execution_proof_invalid" }, 403);
  if (message.includes("workspace_deletion_execution_policy_not_approved")) {
    return json({ error: "workspace_deletion_execution_policy_not_approved" }, 409);
  }
  const stableOperationalCode = message.match(/workspace_deletion_(?:storage|vault)_[a-z_]+/)?.[0];
  if (stableOperationalCode) return json({ error: stableOperationalCode }, 503);
  if (
    message.includes("workspace_deletion_intent_already_open") ||
    message.includes("workspace_deletion_request_key_reused") ||
    message.includes("workspace_deletion_intent_not_prepared") ||
    message.includes("workspace_deletion_intent_not_confirmed") ||
    message.includes("workspace_deletion_intent_not_cancellable") ||
    message.includes("workspace_deletion_intent_expired") ||
    message.includes("workspace_deletion_impact_changed") ||
    message.includes("workspace_deletion_external_cleanup_not_verified")
  ) {
    return json({ error: message.match(/workspace_deletion_[a-z_]+/)?.[0] ?? "workspace_deletion_conflict" }, 409);
  }
  console.error("workspace-deletion-intent-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "workspace_deletion_intent_internal_error" }, 500);
}

async function executeWorkspaceDeletion(input: { payload: any; sql: any }) {
  const { payload, sql } = input;
  const intentId = uuid(payload?.intentId);
  if (!intentId) return json({ error: "invalid_workspace_deletion_intent_id" }, 400);

  const workspaceRows = await sql`
    select financial_app.require_current_workspace_id()::text as workspace_id
  `;
  const workspaceId = uuid(workspaceRows[0]?.workspace_id);
  if (!workspaceId) throw new Error("workspace_deletion_execution_context_invalid");

  // CR-001B: this is the hard destructive barrier. With the runtime policy disabled
  // (the default and current Production state), this fails before Storage or Vault is touched.
  const beginRows = await sql`
    select financial_app.begin_workspace_deletion_execution(${intentId}::uuid) as result
  `;
  const execution = beginRows[0]?.result;
  const executionNonce = uuid(execution?.executionNonce);
  if (execution?.status !== "executing" || !executionNonce) {
    throw new Error("workspace_deletion_execution_state_invalid");
  }

  // The workspace id comes only from trusted DB context. No client path, workspace id,
  // cleanup proof or external-source flag is accepted from payload.
  const storage = await cleanupWorkspaceStorage(workspaceId);

  await sql`select financial_app.disconnect_google_oauth_connection() as disconnected`;
  const oauthResidue = await sql`
    select connected from financial_app.get_google_oauth_connection_status()
  `;
  if (oauthResidue.length !== 0) throw new Error("workspace_deletion_vault_cleanup_failed");

  await sql`
    select financial_app.record_workspace_deletion_external_cleanup(
      ${intentId}::uuid,
      ${executionNonce}::uuid,
      true,
      true
    ) as result
  `;

  const finalRows = await sql`
    select financial_app.finalize_workspace_deletion_local(
      ${intentId}::uuid,
      ${executionNonce}::uuid
    ) as result
  `;
  const result = finalRows[0]?.result;
  if (result?.status !== "completed" || result?.destructiveOperationExecuted !== true) {
    throw new Error("workspace_deletion_finalize_invalid_result");
  }

  return json({
    ...result,
    externalCleanup: {
      supabaseStorageRemoved: storage.removed,
      oauthVaultVerified: true,
    },
  });
}

export async function handleWorkspaceDeletionIntentAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;
  if (
    action !== "data.deletion_prepare_v1" &&
    action !== "data.deletion_confirm_v1" &&
    action !== "data.deletion_cancel_v1" &&
    action !== "data.deletion_execute_v1"
  ) {
    return null;
  }

  // PRE-020D / CR-001B: Preview and Local never mutate Production workspace state.
  if (environment !== "production") {
    return json({ error: "workspace_deletion_protocol_production_only" }, 403);
  }

  try {
    if (action === "data.deletion_prepare_v1") {
      const requestKey = uuid(payload?.requestKey);
      if (!requestKey) return json({ error: "invalid_workspace_deletion_request_key" }, 400);
      const rows = await sql`
        select financial_app.prepare_workspace_deletion_intent(${requestKey}::uuid) as result
      `;
      return json(rows[0]?.result ?? null);
    }

    if (action === "data.deletion_confirm_v1") {
      const intentId = uuid(payload?.intentId);
      const confirmationNonce = uuid(payload?.confirmationNonce);
      if (!intentId || !confirmationNonce) {
        return json({ error: "invalid_workspace_deletion_confirmation" }, 400);
      }
      const rows = await sql`
        select financial_app.confirm_workspace_deletion_intent(
          ${intentId}::uuid,${confirmationNonce}::uuid
        ) as result
      `;
      const result = rows[0]?.result;
      if (result?.status === "expired") return json(result, 409);
      return json(result ?? null);
    }

    if (action === "data.deletion_execute_v1") {
      return await executeWorkspaceDeletion({ payload, sql });
    }

    const intentId = uuid(payload?.intentId);
    if (!intentId) return json({ error: "invalid_workspace_deletion_intent_id" }, 400);
    const rows = await sql`
      select financial_app.cancel_workspace_deletion_intent(${intentId}::uuid) as result
    `;
    return json(rows[0]?.result ?? null);
  } catch (error) {
    return databaseError(error);
  }
}
