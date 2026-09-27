import { readFileSync, writeFileSync } from "node:fs";

const path = "app/inicio-overview.tsx";
let source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0 || source.indexOf(oldText, first + 1) >= 0) {
    throw new Error(`10.0.23 patch guard failed: ${label}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
`type ForecastSnapshot = {
  summary: {
    projectedIncomeCents: number;`,
`type ForecastSnapshot = {
  period: {
    dateFrom: string;
    dateTo: string;
    accountId: string | null;
  };
  summary: {
    openingBalanceCents: number;
    projectedIncomeCents: number;`,
"forecast contract",
);

replaceOnce(
`  const consistency = checkHomeConsistency({
    financial,
    monthly: data.monthly,
    budgetMonth: data.budgets?.month ?? null,
    today,
  });
  const budget = consistency.budgetMonthMatches ? data.budgets : null;`,
`  const consistency = checkHomeConsistency({
    financial,
    monthly: data.monthly,
    budget: data.budgets,
    forecast: data.forecast,
    today,
  });
  const budget = consistency.budgetMonthMatches && consistency.budgetActualMatches ? data.budgets : null;
  const forecast = consistency.forecastOpeningBalanceMatches ? data.forecast : null;`,
"runtime consistency inputs",
);

const marker = "  const forecast = consistency.forecastOpeningBalanceMatches ? data.forecast : null;";
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error("10.0.23 patch guard failed: forecast marker");
const tailStart = markerIndex + marker.length;
source = source.slice(0, tailStart) + source.slice(tailStart).replaceAll("data.forecast", "forecast");

writeFileSync(path, source);
