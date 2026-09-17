import AppShell from "../app-shell";
import ModuleContextNavigation from "../module-context-navigation";
import {
  loadForecastSnapshot,
  resolveForecastSelection,
  type ForecastSelectionInput,
} from "../../src/application/forecast/forecast-loader";
import {
  forecastSelectionFromSearchParams,
  type ForecastSearchParams,
} from "../../src/application/forecast/forecast-query-state";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import { forecastModuleLinks } from "../../src/application/navigation/module-context";
import { ForecastClient } from "./forecast-client";
import premium from "./forecast-premium.module.css";

export const dynamic = "force-dynamic";

function safeSelection(requested: ForecastSelectionInput): ForecastSelectionInput {
  try {
    resolveForecastSelection(requested);
    return requested;
  } catch (error) {
    console.warn("forecast-invalid-selection", error instanceof Error ? error.message : String(error));
    return {};
  }
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<ForecastSearchParams>;
}) {
  const requestedSelection = forecastSelectionFromSearchParams(await searchParams);
  const fallbackSelection = safeSelection(requestedSelection);
  let initialSnapshot: ForecastSnapshot | null = null;
  try {
    initialSnapshot = await loadForecastSnapshot(fallbackSelection);
  } catch (error) {
    console.error("forecast-initial-snapshot", error instanceof Error ? error.message : String(error));
  }

  const resolvedSelection = initialSnapshot?.period ?? resolveForecastSelection(fallbackSelection);

  return (
    <AppShell>
      <div className={premium.root}>
        <ModuleContextNavigation
          links={forecastModuleLinks(resolvedSelection)}
          ariaLabel="Continuar desde Previsión"
        />
        <ForecastClient initialSnapshot={initialSnapshot} />
      </div>
    </AppShell>
  );
}
