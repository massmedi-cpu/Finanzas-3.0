import AppShell from "./app-shell";
import DashboardClient from "./dashboard-client";
import { runCompleteFoundationHealthChecks } from "../src/core/foundation-gate";

export const dynamic = "force-dynamic";

export default function Home() {
  const health = runCompleteFoundationHealthChecks();

  if (health.status !== "ok") {
    const failedChecks = health.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
    throw new Error(`Fundamentos no válidos: ${failedChecks}`);
  }

  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
