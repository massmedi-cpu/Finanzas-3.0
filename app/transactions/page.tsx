import AppShell from "../app-shell";
import AutomaticCategoryLabel from "./automatic-category-label";
import TransactionsClient from "./transactions-client";

export default function TransactionsPage() {
  return (
    <AppShell>
      <AutomaticCategoryLabel />
      <TransactionsClient />
    </AppShell>
  );
}
