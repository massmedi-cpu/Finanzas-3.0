import AppShell from "./app-shell";
import DashboardClient from "./dashboard-client";

export default function Home() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
