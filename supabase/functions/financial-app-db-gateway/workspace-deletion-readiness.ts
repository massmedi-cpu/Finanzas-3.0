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

  // Diagnóstico Production-only. Preview/Local no consulta readiness de borrado de Production.
  if (input.environment !== "production") {
    return json({ error: "workspace_deletion_readiness_production_only" }, 403);
  }

  const rows = await input.sql`
    select financial_app.workspace_deletion_readiness() as readiness
  `;
  const readiness = rows[0]?.readiness;
  if (
    !readiness ||
    typeof readiness !== "object" ||
    Array.isArray(readiness) ||
    typeof readiness.canExecute !== "boolean" ||
    readiness.destructiveOperationExecuted !== false
  ) {
    return json({ error: "workspace_deletion_readiness_unavailable" }, 503);
  }

  // CR-001C/D: el bundle ya contiene el orquestador y el endpoint web de autoservicio.
  // Esto describe capacidad de código. La operación destructiva continúa gobernada por la
  // política DB: mientras policy/retention/activation sigan OFF, canExecute permanece false.
  const readinessRecord = readiness as Record<string, unknown>;
  const existingRuntime =
    readinessRecord.runtimeFoundation &&
    typeof readinessRecord.runtimeFoundation === "object" &&
    !Array.isArray(readinessRecord.runtimeFoundation)
      ? (readinessRecord.runtimeFoundation as Record<string, unknown>)
      : {};

  return json({
    readiness: {
      ...readinessRecord,
      runtimeFoundation: {
        ...existingRuntime,
        runtimeOrchestratorImplemented: true,
        selfServiceExecutionEndpointExposed: true,
      },
    },
  });
}
