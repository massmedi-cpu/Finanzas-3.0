import AppShell from "../app-shell";
import AccountsClient from "./accounts-client";

export const dynamic = "force-dynamic";

export default function AccountsPage() {
  return (
    <AppShell>
      <AccountsClient />
    </AppShell>
  );
}
