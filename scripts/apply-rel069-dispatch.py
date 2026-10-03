from pathlib import Path
import json

route = Path("app/api/dashboard/route.ts")
text = route.read_text()
old = 'const SCOPES = new Set(["primary", "secondary", "all"] as const);\ntype DashboardScope = "primary" | "secondary" | "all";'
new = 'const SCOPES = new Set(["critical", "activity", "primary", "secondary", "all"] as const);\ntype DashboardScope = "critical" | "activity" | "primary" | "secondary" | "all";'
assert text.count(old) == 1, "dashboard scope declaration drifted"
text = text.replace(old, new)
old = '  if (scope === "primary") return [financial, transactions];\n  if (scope === "secondary") return secondary;'
new = '  if (scope === "critical") return [financial];\n  if (scope === "activity") return [transactions];\n  if (scope === "primary") return [financial, transactions];\n  if (scope === "secondary") return secondary;'
assert text.count(old) == 1, "dashboard operations scope block drifted"
route.write_text(text.replace(old, new))

home = Path("app/inicio-overview.tsx")
text = home.read_text()
old = 'type DashboardScope = "primary" | "secondary";'
new = 'type DashboardScope = "critical" | "activity" | "primary" | "secondary";'
assert text.count(old) == 1, "client scope declaration drifted"
text = text.replace(old, new)
old = '  const [primaryLoading, setPrimaryLoading] = useState(true);\n  const [secondaryLoading, setSecondaryLoading] = useState(true);'
new = '  const [primaryLoading, setPrimaryLoading] = useState(true);\n  const [activityLoading, setActivityLoading] = useState(true);\n  const [secondaryLoading, setSecondaryLoading] = useState(true);'
assert text.count(old) == 1, "loading state block drifted"
text = text.replace(old, new)
old = '      if (scope === "primary") setDataThroughDate(envelope.dataThroughDate ?? null);'
new = '      if (scope === "activity" || scope === "primary") setDataThroughDate(envelope.dataThroughDate ?? null);'
assert text.count(old) == 1, "data-through-date scope block drifted"
text = text.replace(old, new)
old = '''  const refreshDashboard = useCallback(async () => {
    setPrimaryLoading(true);
    setDataThroughDate(null);
    setIndependentSources([]);
    const statusPromise = loadSyncStatus();
    await loadScope("primary", ["financial", "transactions"]);
    setPrimaryLoading(false);
    setSecondaryLoading(true);
    await Promise.all([loadScope("secondary", ["monthly", "budgets", "forecast"]), statusPromise]);
    setSecondaryLoading(false);
  }, [loadScope, loadSyncStatus]);'''
new = '''  const refreshDashboard = useCallback(async () => {
    setPrimaryLoading(true);
    setActivityLoading(true);
    setSecondaryLoading(true);
    setDataThroughDate(null);
    setIndependentSources([]);

    const statusPromise = loadSyncStatus();
    const activityPromise = loadScope("activity", ["transactions"])
      .finally(() => setActivityLoading(false));
    const secondaryPromise = loadScope("secondary", ["monthly", "budgets", "forecast"])
      .finally(() => setSecondaryLoading(false));

    await loadScope("critical", ["financial"]);
    setPrimaryLoading(false);
    await Promise.all([activityPromise, secondaryPromise, statusPromise]);
  }, [loadScope, loadSyncStatus]);'''
assert text.count(old) == 1, "refreshDashboard block drifted"
text = text.replace(old, new)
old = '<main className={styles.shell} aria-busy={primaryLoading || secondaryLoading}>'
new = '<main className={styles.shell} aria-busy={primaryLoading || activityLoading || secondaryLoading}>'
assert text.count(old) == 1, "main busy state drifted"
text = text.replace(old, new)
old = '!primaryLoading && !secondaryLoading'
assert text.count(old) == 2, "expected two settled-notice guards"
text = text.replace(old, '!primaryLoading && !activityLoading && !secondaryLoading')
old = '        loading={primaryLoading || secondaryLoading}'
new = '        loading={primaryLoading || activityLoading || secondaryLoading}'
assert text.count(old) == 1, "smart brief loading guard drifted"
text = text.replace(old, new)
marker = '''          ) : primaryLoading ? (
            <div className={styles.skeleton} />
          ) : (
            <p className={styles.empty}>{transactions ? "No hay actividad reciente." : "La actividad reciente no está disponible ahora."}</p>'''
replacement = '''          ) : activityLoading ? (
            <div className={styles.skeleton} aria-label="Cargando actividad reciente" />
          ) : (
            <p className={styles.empty}>{transactions ? "No hay actividad reciente." : "La actividad reciente no está disponible ahora. El resto del resumen sigue operativo."}</p>'''
assert text.count(marker) == 1, "activity loading block drifted"
home.write_text(text.replace(marker, replacement))

Path("scripts/verify-home-progressive-loading-10.0.69.mjs").write_text('''import fs from "node:fs";

const home = fs.readFileSync("app/inicio-overview.tsx", "utf8");
const route = fs.readFileSync("app/api/dashboard/route.ts", "utf8");
const assertions = [
  [route.includes('"critical", "activity", "primary", "secondary", "all"'), "dashboard API exposes backward-compatible critical/activity scopes"],
  [route.includes('if (scope === "critical") return [financial];'), "critical scope requests only financial snapshot"],
  [route.includes('if (scope === "activity") return [transactions];'), "activity scope requests only transactions"],
  [home.includes('loadScope("critical", ["financial"])'), "Inicio requests critical financial scope"],
  [home.includes('loadScope("activity", ["transactions"])'), "Inicio requests activity independently"],
  [home.includes('setActivityLoading(false)'), "activity has an independent loading lifecycle"],
  [home.includes('aria-busy={primaryLoading || activityLoading || secondaryLoading}'), "busy state covers all progressive scopes"],
  [!home.includes('await loadScope("primary", ["financial", "transactions"])'), "Inicio no longer blocks financial data on transactions"],
];
for (const [ok, label] of assertions) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (assertions.some(([ok]) => !ok)) process.exit(1);
''')

Path("tests/e2e/inicio-progressive-loading-10.0.69.spec.ts").write_text('''import { expect, test, type Page } from "@playwright/test";

const emptyData = () => ({ financial: null, monthly: null, budgets: null, forecast: null, transactions: null });

async function mockProgressiveDashboard(page: Page) {
  const requestedScopes: string[] = [];
  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: "sync-1", status: "success", startedAt: "2026-10-03T08:00:00.000Z", finishedAt: "2026-10-03T08:00:01.000Z", rowsSeen: 1, rowsInserted: 0, rowsRevised: 0, rowsSkipped: 1, rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null, errorMessage: null }, cursors: [] }) });
  });

  await page.route("**/api/dashboard**", async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") ?? "all";
    requestedScopes.push(scope);
    const data: any = emptyData();
    let requestedSources: string[] = [];
    let dataThroughDate: string | null = null;

    if (scope === "critical") {
      requestedSources = ["financial"];
      data.financial = {
        period: { dateFrom: "2026-10-01", dateTo: "2026-10-03", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000, savingsCents: 150000, savingsRateBps: 7500, quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 } },
        balances: { asOfDate: "2026-10-03", activeBalanceCents: 123456, accounts: [{ id: "acc-1", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 123456, explicitBalanceDate: "2026-10-03" }] },
      };
    } else if (scope === "activity") {
      requestedSources = ["transactions"];
      await new Promise((resolve) => setTimeout(resolve, 1500));
      dataThroughDate = "2026-10-03";
      data.transactions = { rows: [{ id: "tx-late", bankDate: "2026-10-03", amountCents: -1250, account: { id: "acc-1", name: "Cuenta principal" }, concept: { effective: "Compra de prueba" }, merchant: { effectiveName: "Movimiento tardío" }, category: { effectiveId: null, effectiveName: null }, kind: { effective: "expense" }, duplicateState: "none", excludedFromAnalytics: false }], totalCount: 1 };
    } else if (scope === "secondary") {
      requestedSources = ["monthly", "budgets", "forecast"];
      data.monthly = { dateFrom: "2025-11-01", dateTo: "2026-10-03", rows: [{ monthStart: "2026-09-01", incomeCents: 180000, expenseCents: 90000, operatingNetCents: 90000 }, { monthStart: "2026-10-01", incomeCents: 200000, expenseCents: 50000, operatingNetCents: 150000 }] };
      data.budgets = { month: "2026-10", total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 50000, remainingCents: 50000, progressBps: 5000, status: "on_track" }, categories: [] };
      data.forecast = { period: { dateFrom: "2026-10-03", dateTo: "2026-11-02", accountId: null }, summary: { openingBalanceCents: 123456, projectedIncomeCents: 0, projectedExpenseCents: 0, projectedNetCents: 0, projectedClosingBalanceCents: 123456, plannedItems: 0 }, items: [] };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: 1, scope, asOfDate: "2026-10-03", dataThroughDate, generatedAt: "2026-10-03T08:00:00.000Z", requestedSources, failedSources: [], data }) });
  });
  return requestedScopes;
}

test.describe("Financial App 10.0.69 · carga progresiva de Inicio", () => {
  test("muestra el saldo crítico antes de que termine la actividad lenta", async ({ page }) => {
    const requestedScopes = await mockProgressiveDashboard(page);
    await page.goto("/");
    const balanceCard = page.locator("article").filter({ hasText: "Saldo total en cuentas" });
    await expect(balanceCard.locator("strong")).not.toHaveText("—", { timeout: 1200 });
    await expect(page.getByText("Movimiento tardío", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cargando actividad reciente")).toBeVisible();
    await expect(page.getByText("Movimiento tardío", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(requestedScopes).toContain("critical");
    expect(requestedScopes).toContain("activity");
    expect(requestedScopes).toContain("secondary");
    expect(requestedScopes).not.toContain("primary");
  });
});
''')

Path("docs/precommercial-audit/12b-home-critical-path-10.0.69.md").write_text('''# REL-069 · Inicio: ruta crítica progresiva · 10.0.69

## Objetivo
Reducir el tiempo percibido hasta la información financiera principal sin cambiar cálculos, persistencia ni la fuente bancaria oficial de solo lectura.

## Cambio
- `critical`: solicita únicamente `financial.snapshot`.
- `activity`: solicita `transaction.query` de forma independiente.
- `secondary`: mantiene histórico, presupuestos y previsión.
- `primary` se conserva en la API por compatibilidad hacia atrás.
- Inicio libera su estado de carga principal cuando termina `critical`; actividad y secundarios mantienen ciclos propios.
- Un fallo o demora de actividad ya no impide mostrar saldo y balance mensual.

## Protección automática
- Verificador estático `verify-home-progressive-loading-10.0.69.mjs`.
- E2E `inicio-progressive-loading-10.0.69.spec.ts` retrasa actividad y exige saldo visible antes.
- Se conserva el diagnóstico de reflow 200%/400% de REL-069.

## Invariantes
- Sin cambios en fórmulas financieras.
- Sin escritura en la fuente bancaria oficial.
- Sin cambio del gateway de persistencia.
- `scope=primary` preservado para consumidores existentes.
''')

package = Path("package.json")
payload = json.loads(package.read_text())
payload["scripts"]["verify:home-progressive-loading"] = "node scripts/verify-home-progressive-loading-10.0.69.mjs"
verify_cmd = "node scripts/verify-home-progressive-loading-10.0.69.mjs"
if verify_cmd not in payload["scripts"]["postbuild"]:
    payload["scripts"]["postbuild"] += " && " + verify_cmd
package.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
