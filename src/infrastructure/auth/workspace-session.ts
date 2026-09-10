import { cookies } from "next/headers";
import { AUTH_ACCESS_COOKIE } from "./access-control";

export type WorkspaceSession = {
  accessToken: string;
};

export async function resolveWorkspaceSession(): Promise<WorkspaceSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() ?? "";
  return accessToken ? { accessToken } : null;
}
