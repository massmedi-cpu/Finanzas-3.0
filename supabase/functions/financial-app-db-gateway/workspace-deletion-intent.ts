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
  if (
    message.includes("workspace_deletion_intent_already_open") ||
    message.includes("workspace_deletion_request_key_reused") ||
    message.includes("workspace_deletion_intent_not_prepared") ||
    message.includes("workspace_deletion_intent_not_cancellable") ||
    message.includes("workspace_deletion_impact_changed")
  ) {
    return json({ error: message.match(/workspace_deletion_[a-z_]+/)?.[0] ?? "workspace_deletion_conflict" }, 409);
  }
  console.error("workspace-deletion-intent-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "workspace_deletion_intent_internal_error" }, 500);
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
    action !== "data.deletion_cancel_v1"
  ) {
    return null;
  }

  // PRE-020D foundation: ni Preview ni Local pueden crear/confirmar estado contra Production.
  // Además, confirmar un intent NO ejecuta borrado: no existe acción data.deletion_execute_v1.
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
