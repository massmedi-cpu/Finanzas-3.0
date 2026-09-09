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

export async function resolveWorkspaceContext(
  request: Request,
  sql: any,
): Promise<WorkspaceContext | null> {
  const userToken = request.headers.get("x-financial-app-user-token")?.trim() ?? "";
  if (!userToken) return null;

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

  return {
    userId: data.user.id,
    workspaceId: membership.workspace_id,
    role: membership.role,
  };
}
