import { createClient } from "supabase-js";
import type { WorkspaceContext } from "../../../src/domain/workspace-context.ts";

export class WorkspaceContextError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "WorkspaceContextError";
  }
}

function authClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new WorkspaceContextError("workspace_auth_unavailable", 503);
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function clearWorkspaceScope(sql: any, failClosed: boolean) {
  try {
    // Un backend físico puede ser reciclado por un pooler. Antes de consultar siquiera
    // memberships se restaura el session_user y se eliminan GUC de una petición anterior.
    await sql.unsafe("reset role");
    await sql`
      select
        pg_catalog.set_config('financial_app.workspace_id', '', false),
        pg_catalog.set_config('financial_app.user_id', '', false)
    `;
  } catch (error) {
    if (failClosed) {
      throw new WorkspaceContextError("workspace_tenancy_unavailable", 503);
    }
    console.error("financial-app-workspace-reset", error instanceof Error ? error.message : String(error));
  }
}

async function activateWorkspaceScope(sql: any, context: WorkspaceContext) {
  try {
    // PRE-001: la conexión llega como postgres únicamente para validar la membership.
    // Antes de cualquier consulta de negocio cambia a un rol NOLOGIN/NOBYPASSRLS.
    await sql.unsafe("set role financial_app_gateway");
    await sql`
      select
        pg_catalog.set_config('financial_app.workspace_id', ${context.workspaceId}, false),
        pg_catalog.set_config('financial_app.user_id', ${context.userId}, false)
    `;
  } catch {
    throw new WorkspaceContextError("workspace_tenancy_unavailable", 503);
  }
}

export async function resetWorkspaceScope(sql: any) {
  await clearWorkspaceScope(sql, false);
}

export async function resolveWorkspaceContext(
  request: Request,
  sql: any,
): Promise<WorkspaceContext> {
  // Debe ser la primera operación SQL de la petición. Esto elimina contaminación de
  // sesión incluso cuando el proveedor reutiliza un backend físico entre conexiones.
  await clearWorkspaceScope(sql, true);

  const userToken = request.headers.get("x-financial-app-user-token")?.trim() ?? "";
  if (!userToken) {
    throw new WorkspaceContextError("workspace_context_required", 403);
  }

  const supabase = authClient();
  const { data, error } = await supabase.auth.getUser(userToken);
  if (error || !data.user?.id) {
    throw new WorkspaceContextError("workspace_user_invalid", 401);
  }

  let memberships: any[];
  try {
    memberships = await sql`
      select workspace_id, role
      from financial_app.workspace_memberships
      where user_id=${data.user.id}::uuid
        and active=true
        and is_default=true
      order by workspace_id
      limit 2
    `;
  } catch {
    throw new WorkspaceContextError("workspace_tenancy_unavailable", 503);
  }

  if (memberships.length !== 1) {
    throw new WorkspaceContextError(
      memberships.length === 0 ? "workspace_access_denied" : "workspace_membership_ambiguous",
      memberships.length === 0 ? 403 : 500,
    );
  }

  const membership = memberships[0];
  if (
    typeof membership.workspace_id !== "string" ||
    (membership.role !== "owner" && membership.role !== "member")
  ) {
    throw new WorkspaceContextError("workspace_membership_invalid", 500);
  }

  const context: WorkspaceContext = {
    userId: data.user.id,
    workspaceId: membership.workspace_id,
    role: membership.role,
  };

  await activateWorkspaceScope(sql, context);
  return context;
}
