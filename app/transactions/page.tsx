import AppShell from "../app-shell";
import TransactionsClient from "./transactions-client";

export default function TransactionsPage() {
  return (
    <AppShell>
      <TransactionsClient />
    </AppShell>
  );
}
