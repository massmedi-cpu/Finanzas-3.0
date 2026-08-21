import {
  addMonths,
  buildForecast,
  combineForecasts,
  expandPlannedEvents,
  type ForecastMovement,
  type PlannedEventInput,
  type RecurringPattern,
  type ScenarioInput,
} from './forecast-engine';

const DAY_MS = 86_400_000;

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function daysBetween(from: string, to: string): number {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.valueOf() - start.valueOf()) / DAY_MS));
}

export function normalizeHorizonMonths(value: number | string | null | undefined, fallback = 12): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.max(1, Math.min(60, Math.trunc(fallback) || 12));
  return Math.max(1, Math.min(60, parsed));
}

export function maxScenarioHorizonMonths(scenarios: ScenarioInput[], fallback = 12): number {
  const active = scenarios
    .filter((scenario) => scenario.active)
    .map((scenario) => normalizeHorizonMonths(scenario.horizon_months, fallback));
  return active.length > 0 ? Math.max(...active, normalizeHorizonMonths(fallback)) : normalizeHorizonMonths(fallback);
}

export interface LongHorizonForecast {
  fromDate: string;
  horizonDate: string;
  horizonMonths: number;
  movements: ForecastMovement[];
}

export function buildLongHorizonForecast(
  patterns: RecurringPattern[],
  plannedEvents: PlannedEventInput[],
  fromDate: string,
  months = 12,
): LongHorizonForecast {
  const horizonMonths = normalizeHorizonMonths(months);
  const horizonDate = addMonths(fromDate, horizonMonths);
  const detected = new Map<string, ForecastMovement>();

  // El motor histórico limita cada llamada a 24 ocurrencias por patrón. Dividir en
  // ventanas de 12 meses mantiene ese límite de seguridad y permite llegar a 60
  // meses sin truncar patrones mensuales ni alterar su algoritmo validado.
  for (let offset = 0; offset < horizonMonths; offset += 12) {
    const segmentStart = addMonths(fromDate, offset);
    const segmentEnd = addMonths(fromDate, Math.min(horizonMonths, offset + 12));
    const segmentDays = daysBetween(segmentStart, segmentEnd);
    for (const movement of buildForecast(patterns, segmentStart, segmentDays)) {
      if (movement.expectedDate > fromDate && movement.expectedDate <= horizonDate) {
        detected.set(movement.id, movement);
      }
    }
  }

  const totalDays = daysBetween(fromDate, horizonDate);
  const planned = expandPlannedEvents(plannedEvents, fromDate, totalDays)
    .filter((movement) => movement.expectedDate > fromDate && movement.expectedDate <= horizonDate);

  return {
    fromDate,
    horizonDate,
    horizonMonths,
    movements: combineForecasts([...detected.values()], planned),
  };
}
