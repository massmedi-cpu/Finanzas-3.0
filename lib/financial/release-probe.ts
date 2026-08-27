import { APP_VERSION } from "@/lib/app-version";
import { getActionableIntelligence } from "@/lib/financial/actionable-intelligence";
import { getArchiveOverview } from "@/lib/financial/archive";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { getForecastCalendar } from "@/lib/financial/forecast-calendar";
import { getHomePulse } from "@/lib/financial/home-pulse";
import { getMatchingObservability } from "@/lib/financial/matching-observability";
import { getMovements } from "@/lib/financial/movements";

export type AuthenticatedReleaseProbe = {
  ok: true;
  version: string;
  privateSession: true;
  checks: {
    dashboardReadable: boolean;
    homePulseReadable: boolean;
    movementsReadable: boolean;
    forecastReadable: boolean;
    archiveReadable: boolean;
    forecastContracts: boolean;
    matchingObservabilityReadable: boolean;
    matchingQualityGate: boolean;
    intelligenceReadable: boolean;
    intelligenceContracts: boolean;
  };
};

export async function getAuthenticatedReleaseProbe(): Promise<AuthenticatedReleaseProbe> {
  const [dashboard, homePulse, movements, forecast, archive, matching, intelligence] = await Promise.all([
    getFinancialDashboard(),
    getHomePulse(),
    getMovements({ page: 1, pageSize: 1 }),
    getForecastCalendar(1),
    getArchiveOverview(null),
    getMatchingObservability(90),
    getActionableIntelligence(400),
  ]);

  const checks = {
    dashboardReadable: Boolean(dashboard.month) && Array.isArray(dashboard.accounts),
    homePulseReadable:
      homePulse.version === APP_VERSION &&
      Boolean(homePulse.month) &&
      homePulse.rules.readOnly === true &&
      homePulse.rules.singleTransactionPass === true &&
      homePulse.rules.accountsExcludedFromCriticalPath === true,
    movementsReadable: movements.ok === true && Array.isArray(movements.items) && Array.isArray(movements.facets.accounts),
    forecastReadable: forecast.version === APP_VERSION && forecast.months === 1 && Array.isArray(forecast.projectionMonths),
    archiveReadable: archive.private === true && Array.isArray(archive.documents),
    forecastContracts:
      forecast.rules.oneToOneActualMatching === true &&
      forecast.rules.serverSideMonthlyProjection === true &&
      forecast.rules.dismissedEventsExcludedFromMetrics === true,
    matchingObservabilityReadable:
      matching.version === APP_VERSION &&
      matching.rules.noFinancialValuesStored === true &&
      matching.rules.derivedFromCanonicalHistory === true &&
      matching.releaseGate.sampleAware === true,
    matchingQualityGate: matching.releaseGate.pass === true,
    intelligenceReadable:
      intelligence.version === APP_VERSION &&
      Array.isArray(intelligence.anomalies) &&
      Array.isArray(intelligence.recurring) &&
      Array.isArray(intelligence.rising) &&
      Array.isArray(intelligence.opportunities),
    intelligenceContracts:
      intelligence.rules.sourceReadOnly === true &&
      intelligence.rules.reusesControlAlertStates === true &&
      intelligence.rules.financialValuesPersisted === false &&
      intelligence.rules.usesCompleteMonthsForTrends === true &&
      intelligence.rules.savingsScenarioPercent === 10,
  };

  if (!Object.values(checks).every(Boolean)) throw new Error("release_probe_contract_failed");

  return { ok: true, version: APP_VERSION, privateSession: true, checks };
}
