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
