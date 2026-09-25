import AppShell from "../app-shell";
import ModuleContextNavigation from "../module-context-navigation";
import {
  loadForecastSnapshot,
  resolveForecastSelection,
  type ForecastSelectionInput,
  type ResolvedForecastSelection,
} from "../../src/application/forecast/forecast-loader";
import {
  forecastSelectionFromSearchParams,
  type ForecastSearchParams,
} from "../../src/application/forecast/forecast-query-state";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import { forecastRecurrenceHandoffFromSearchParams } from "../../src/application/forecast/recurrence-flow";
import { forecastModuleLinks } from "../../src/application/navigation/module-context";
import { ForecastClient } from "./forecast-client";
import premium from "./forecast-premium.module.css";

export const dynamic = "force-dynamic";

type ValidatedSelection = {
  input: ForecastSelectionInput;
  resolved: ResolvedForecastSelection;
  requestedIsValid: boolean;
};

function safeSelection(requested: ForecastSelectionInput): ValidatedSelection {
  try {
    return {
      input: requested,
      resolved: resolveForecastSelection(requested),
      requestedIsValid: true,
    };
  } catch (error) {
    console.warn("forecast-invalid-selection", error instanceof Error ? error.message : String(error));
    return {
      input: {},
      resolved: resolveForecastSelection(),
      requestedIsValid: false,
    };
  }
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<ForecastSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  const requestedSelection = forecastSelectionFromSearchParams(rawSearchParams);
  const validatedSelection = safeSelection(requestedSelection);
  let initialSnapshot: ForecastSnapshot | null = null;
  try {
    initialSnapshot = await loadForecastSnapshot(validatedSelection.input);
  } catch (error) {
    console.error("forecast-initial-snapshot", error instanceof Error ? error.message : String(error));
  }

  const resolvedSelection = initialSnapshot?.period ?? validatedSelection.resolved;
  const recurrenceHandoff = validatedSelection.requestedIsValid
    ? forecastRecurrenceHandoffFromSearchParams(rawSearchParams, resolvedSelection)
    : null;

  return (
    <AppShell>
      <div className={premium.root}>
        <ModuleContextNavigation
          links={forecastModuleLinks(resolvedSelection)}
          ariaLabel="Continuar desde Previsión"
        />
        <ForecastClient
          initialSnapshot={initialSnapshot}
          initialSelection={resolvedSelection}
          recurrenceHandoff={recurrenceHandoff}
        />
      </div>
    </AppShell>
  );
}
