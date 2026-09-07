import DashboardClient from "./dashboard-client";
import { getBuildInfo } from "../src/core/build-info";
import { runCompleteFoundationHealthChecks } from "../src/core/foundation-gate";

export const dynamic = "force-dynamic";

export default function Home() {
  const build = getBuildInfo();
  const health = runCompleteFoundationHealthChecks();

  if (health.status !== "ok") {
    const failedChecks = health.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
    throw new Error(`Fundamentos no válidos: ${failedChecks}`);
  }

  return <DashboardClient phaseLabel={`Fase ${build.phase} · ${build.phaseName}`} />;
}
