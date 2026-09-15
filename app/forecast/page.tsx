import AppShell from "../app-shell";
import { loadForecastSnapshot } from "../../src/application/forecast/forecast-loader";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import { ForecastClient } from "./forecast-client";
import premium from "./forecast-premium.module.css";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  let initialSnapshot: ForecastSnapshot | null = null;
  try {
    initialSnapshot = await loadForecastSnapshot();
  } catch (error) {
    console.error("forecast-initial-snapshot", error instanceof Error ? error.message : String(error));
  }

  return (
    <AppShell>
      <div className={premium.root}>
        <ForecastClient initialSnapshot={initialSnapshot} />
      </div>
    </AppShell>
  );
}
