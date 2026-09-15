import AppShell from "../app-shell";
import { loadForecastSnapshot } from "../../src/application/forecast/forecast-loader";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import { ForecastClient } from "./forecast-client";

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
      <ForecastClient initialSnapshot={initialSnapshot} />
    </AppShell>
  );
}
