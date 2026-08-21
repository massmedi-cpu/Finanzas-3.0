import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireAuthorizedUser } from "@/lib/auth/require-user";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthorizedUser();
  return <AppShell email={user.email}>{children}</AppShell>;
}
