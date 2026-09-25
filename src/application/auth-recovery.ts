export type AuthRecoveryState = "required" | "unavailable";

export function authRecoveryFromCode(code: unknown): AuthRecoveryState | null {
  if (code === "authentication_required") return "required";
  if (code === "authentication_unavailable") return "unavailable";
  return null;
}

export function authRecoveryFromError(error: unknown): AuthRecoveryState | null {
  return authRecoveryFromCode(error instanceof Error ? error.message : null);
}

export function requestErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "request_failed";
  const body = payload as Record<string, unknown>;
  if (typeof body.code === "string" && body.code) return body.code;
  if (typeof body.error === "string" && body.error) return body.error;
  return "request_failed";
}
