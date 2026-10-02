import AppShell from "../app-shell";
import NetWorthClient from "./net-worth-client";

export const dynamic = "force-dynamic";

export default function NetWorthPage() {
  return (
    <AppShell>
      <NetWorthClient />
    </AppShell>
  );
}
