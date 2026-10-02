import AppShell from "../app-shell";
import NetWorthClient from "./net-worth-client";

export const metadata = {
  title: "Patrimonio · Financial App",
  description: "Patrimonio bancario observado a partir de los saldos financieros centrales.",
};

export default function NetWorthPage() {
  return (
    <AppShell>
      <NetWorthClient />
    </AppShell>
  );
}
