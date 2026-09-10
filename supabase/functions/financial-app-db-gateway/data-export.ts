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

export async function handleDataExportAction(input: {
  action: unknown;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  if (input.action !== "data.export_v1") return null;

  // PRE-020B: defensa en profundidad. El índice del gateway ya bloquea cualquier
  // acción no incluida en PREVIEW_READ_ONLY_ACTIONS cuando el OIDC es Preview;
  // este segundo gate impide además que el handler pueda reutilizarse por error
  // fuera de Production en futuras refactorizaciones.
  if (input.environment !== "production") {
    return json({ error: "data_export_production_only" }, 403);
  }

  const rows = await input.sql`
    select financial_app.export_current_workspace_data() as export_data
  `;
  const exportData = rows[0]?.export_data;
  if (!exportData || typeof exportData !== "object" || Array.isArray(exportData)) {
    return json({ error: "data_export_unavailable" }, 503);
  }

  return json({ export: exportData });
}
