import { APP_VERSION } from "@/lib/app-version";
import { getArchiveOverview } from "@/lib/financial/archive";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { getForecastCalendar } from "@/lib/financial/forecast-calendar";
import { getMovements } from "@/lib/financial/movements";

export type AuthenticatedReleaseProbe = {
  ok: true;
  version: string;
  privateSession: true;
  checks: {
    dashboardReadable: boolean;
    movementsReadable: boolean;
    forecastReadable: boolean;
    archiveReadable: boolean;
    forecastContracts: boolean;
  };
};

export async function getAuthenticatedReleaseProbe(): Promise<AuthenticatedReleaseProbe> {
  const [dashboard, movements, forecast, archive] = await Promise.all([
    getFinancialDashboard(),
    getMovements({ page: 1, pageSize: 1 }),
    getForecastCalendar(1),
    getArchiveOverview(null),
  ]);

  const checks = {
    dashboardReadable: Boolean(dashboard.month) && Array.isArray(dashboard.accounts),
    movementsReadable: movements.ok === true && Array.isArray(movements.items) && Array.isArray(movements.facets.accounts),
    forecastReadable: forecast.version === APP_VERSION && forecast.months === 1 && Array.isArray(forecast.projectionMonths),
    archiveReadable: archive.private === true && Array.isArray(archive.documents),
    forecastContracts:
      forecast.rules.oneToOneActualMatching === true &&
      forecast.rules.serverSideMonthlyProjection === true &&
      forecast.rules.dismissedEventsExcludedFromMetrics === true,
  };

  if (!Object.values(checks).every(Boolean)) throw new Error("release_probe_contract_failed");

  return { ok: true, version: APP_VERSION, privateSession: true, checks };
}
