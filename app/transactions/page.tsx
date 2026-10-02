import TransactionsClient from "./transactions-client";
import TransactionsQuickNav from "./transactions-quick-nav";

export default function TransactionsPage() {
  return (
    <>
      <TransactionsQuickNav />
      <TransactionsClient />
    </>
  );
}
