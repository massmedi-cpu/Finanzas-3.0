import AppShell from "../app-shell";
import TransactionsClient from "./transactions-client";
import TransactionsQuickNav from "./transactions-quick-nav";

export default function TransactionsPage() {
  return (
    <AppShell>
      <TransactionsQuickNav />
      <TransactionsClient />
    </AppShell>
  );
}
