import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isForecastSnapshotForSelection, type ForecastSnapshot } from "./forecast-contract";
import {
  resolveForecastSelection,
  type ForecastSelectionInput,
} from "./forecast-selection";

export {
  resolveForecastSelection,
  type ForecastSelectionInput,
  type ResolvedForecastSelection,
} from "./forecast-selection";

export async function loadForecastSnapshot(input: ForecastSelectionInput = {}): Promise<ForecastSnapshot> {
  const selection = resolveForecastSelection(input);
  const result = await callPersistenceGateway<ForecastSnapshot>("forecast.snapshot", selection);
  if (!isForecastSnapshotForSelection(result, selection)) throw new Error("invalid_forecast_snapshot_contract");
  return result;
}
