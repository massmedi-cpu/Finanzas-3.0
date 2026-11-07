export type WorkspaceRole = "owner" | "member";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export function isWorkspaceContext(value: unknown): value is WorkspaceContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string"
    && row.userId.length > 0
    && typeof row.workspaceId === "string"
    && row.workspaceId.length > 0
    && (row.role === "owner" || row.role === "member");
}

/**
 * REC-AP2-415. Personal release invariant: even a valid Supabase session
 * is insufficient if the verified workspace has collaborators or the caller
 * is a member instead of its sole owner. Fail closed, not silently elevated.
 */
export function isSingleOwnerWorkspaceAccess(role: unknown, membershipCount: unknown): boolean {
  return role === "owner" && membershipCount === 1;
}
