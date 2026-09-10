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

export async function handleWorkspaceDeletionReadinessAction(input: {
  action: unknown;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  if (input.action !== "data.deletion_readiness_v1") return null;

  // PRE-020F es diagnóstico, pero tampoco permite Preview→Production.
  if (input.environment !== "production") {
    return json({ error: "workspace_deletion_readiness_production_only" }, 403);
  }

  const rows = await input.sql`
    select financial_app.workspace_deletion_readiness() as readiness
  `;
  const readiness = rows[0]?.readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) {
    return json({ error: "workspace_deletion_readiness_unavailable" }, 503);
  }
  if (readiness.canExecute !== false || readiness.destructiveOperationExecuted !== false) {
    return json({ error: "workspace_deletion_readiness_fail_closed_violation" }, 503);
  }

  return json({ readiness });
}
