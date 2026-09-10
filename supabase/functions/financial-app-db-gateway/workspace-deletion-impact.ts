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

export async function handleWorkspaceDeletionImpactAction(input: {
  action: unknown;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  if (input.action !== "data.deletion_impact_v1") return null;

  // PRE-020C permanece fuera de Preview→Production incluso siendo sólo lectura.
  // La superficie se valida en Preview con un 403 real y sólo podrá leer datos en Production.
  if (input.environment !== "production") {
    return json({ error: "data_deletion_impact_production_only" }, 403);
  }

  const rows = await input.sql`
    select financial_app.workspace_deletion_impact() as impact
  `;
  const impact = rows[0]?.impact;
  if (!impact || typeof impact !== "object" || Array.isArray(impact)) {
    return json({ error: "data_deletion_impact_unavailable" }, 503);
  }

  return json({ impact });
}
