// Financial App · Production backend alignment bridge
// TEMPORARY DROP-IN for supabase/functions/financial-app-db-gateway/workspace-context.ts.
// Deploy only after PRE-001 tenancy and replace with the strict validated workspace-context
// immediately after isolation/PRE-020/CR-001 are complete.

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
    await sql.unsafe("reset role");
    await sql`
      select
        pg_catalog.set_config('financial_app.workspace_id', '', false),
        pg_catalog.set_config('financial_app.user_id', '', false),
        pg_catalog.set_config('financial_app.workspace_role', '', false),
        pg_catalog.set_config('financial_app.workspace_membership_count', '', false)
    `;
  } catch (error) {
    if (failClosed) throw new WorkspaceContextError("workspace_tenancy_unavailable", 503);
    console.error("financial-app-workspace-reset", error instanceof Error ? error.message : String(error));
  }
}

async function detectIsolationState(sql: any) {
  try {
    const rows = await sql`
      select
        pg_catalog.to_regrole('financial_app_gateway') is not null as gateway_role_exists,
        pg_catalog.to_regprocedure('financial_app.require_current_workspace_id()') is not null as isolation_marker_exists
    `;
    return {
      gatewayRoleExists: rows[0]?.gateway_role_exists === true,
      isolationMarkerExists: rows[0]?.isolation_marker_exists === true,
    };
  } catch {
    throw new WorkspaceContextError("workspace_tenancy_unavailable", 503);
  }
}

async function activateWorkspaceScope(
  sql: any,
  context: WorkspaceContext,
  workspaceMembershipCount: number,
) {
  const state = await detectIsolationState(sql);

  // Only two complete states are valid during rollout:
  // legacy = no role + no isolation marker; strict = role + isolation marker.
  // Any mixed/partial state must fail closed instead of guessing which mode to use.
  if (state.gatewayRoleExists !== state.isolationMarkerExists) {
    throw new WorkspaceContextError("workspace_isolation_state_inconsistent", 503);
  }

  try {
    if (state.gatewayRoleExists && state.isolationMarkerExists) {
      await sql.unsafe("set role financial_app_gateway");
    }

    await sql`
      select
        pg_catalog.set_config('financial_app.workspace_id', ${context.workspaceId}, false),
        pg_catalog.set_config('financial_app.user_id', ${context.userId}, false),
        pg_catalog.set_config('financial_app.workspace_role', ${context.role}, false),
        pg_catalog.set_config('financial_app.workspace_membership_count', ${String(workspaceMembershipCount)}, false)
    `;
  } catch (error) {
    if (error instanceof WorkspaceContextError) throw error;
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
  await clearWorkspaceScope(sql, true);

  const userToken = request.headers.get("x-financial-app-user-token")?.trim() ?? "";
  if (!userToken) throw new WorkspaceContextError("workspace_context_required", 403);

  const supabase = authClient();
  const { data, error } = await supabase.auth.getUser(userToken);
  if (error || !data.user?.id) throw new WorkspaceContextError("workspace_user_invalid", 401);

  let memberships: any[];
  try {
    memberships = await sql`
      select
        m.workspace_id,
        m.role,
        (
          select count(*)::int
          from financial_app.workspace_memberships workspace_member
          where workspace_member.workspace_id=m.workspace_id
        ) as workspace_membership_count
      from financial_app.workspace_memberships m
      where m.user_id=${data.user.id}::uuid
        and m.active=true
        and m.is_default=true
      order by m.workspace_id
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
    (membership.role !== "owner" && membership.role !== "member") ||
    !Number.isInteger(membership.workspace_membership_count) ||
    membership.workspace_membership_count < 1
  ) {
    throw new WorkspaceContextError("workspace_membership_invalid", 500);
  }

  const context: WorkspaceContext = {
    userId: data.user.id,
    workspaceId: membership.workspace_id,
    role: membership.role,
  };

  await activateWorkspaceScope(sql, context, membership.workspace_membership_count);
  return context;
}
