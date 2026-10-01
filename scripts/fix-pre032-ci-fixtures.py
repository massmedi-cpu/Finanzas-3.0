from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(before)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(source.replace(before, after, 1))


# Analysis: tolerate the initial real current-month request, but still require
# that selecting September/1m emits the exact request the test is meant to verify.
replace_once(
    "tests/e2e/analysis.spec.ts",
    '''async function mockAnalysisApi(page: Parameters<typeof test>[0] extends never ? never : any, snapshot: AnalysisSnapshot) {
  await page.route(/\\/api\\/analysis(?:\\?.*)?$/, async (route: any) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe("/api/analysis");
    expect(url.searchParams.get("month")).toBe("2026-09");
    expect(url.searchParams.get("range")).toBe("1m");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
}

async function loadMockAnalysis(page: any, snapshot: AnalysisSnapshot) {
  await mockAnalysisApi(page, snapshot);
  await page.goto("/analysis");
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "1 mes" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
}
''',
    '''async function mockAnalysisApi(page: Parameters<typeof test>[0] extends never ? never : any, snapshot: AnalysisSnapshot) {
  let selectedRequestSeen = false;
  await page.route(/\\/api\\/analysis(?:\\?.*)?$/, async (route: any) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe("/api/analysis");
    if (url.searchParams.get("month") === "2026-09") {
      expect(url.searchParams.get("range")).toBe("1m");
      selectedRequestSeen = true;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  return () => selectedRequestSeen;
}

async function loadMockAnalysis(page: any, snapshot: AnalysisSnapshot) {
  const selectedRequestSeen = await mockAnalysisApi(page, snapshot);
  await page.goto("/analysis");
  await page.getByLabel("Mes de referencia").fill("2026-09");
  await page.getByRole("button", { name: "1 mes" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(selectedRequestSeen).toBe(true);
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
}
''',
)

# These fixtures explicitly model 16 Sep 2026. Freeze Date so their truth does
# not change simply because CI is now running in October or a later month.
frozen = '  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+02:00"));\n'
for path, before, after in [
    (
        "tests/e2e/inicio-smart-brief.spec.ts",
        'async function mockInicio(page: Page) {\n  await page.route("**/*", async (route) => {',
        'async function mockInicio(page: Page) {\n' + frozen + '  await page.route("**/*", async (route) => {',
    ),
    (
        "tests/e2e/dashboard-number-explanations.spec.ts",
        'async function mockDashboard(page: Page) {\n  await page.route("**/*", async (route) => {',
        'async function mockDashboard(page: Page) {\n' + frozen + '  await page.route("**/*", async (route) => {',
    ),
    (
        "tests/e2e/inicio-utility.spec.ts",
        'async function mockInicio(page: Page) {\n  let postCount = 0;',
        'async function mockInicio(page: Page) {\n' + frozen + '  let postCount = 0;',
    ),
    (
        "tests/e2e/premium-dashboard-visual.spec.ts",
        'async function mockDashboard(page: Page) {\n  await page.route("**/*", async (route) => {',
        'async function mockDashboard(page: Page) {\n' + frozen + '  await page.route("**/*", async (route) => {',
    ),
]:
    replace_once(path, before, after)

replace_once(
    "tests/e2e/dashboard-orchestration-contract.spec.ts",
    '''async function installDashboardMocks(
  page: Page,
  secondaryGate?: Promise<void>,
  overrides: Partial<{ financial: typeof financial; monthly: typeof monthly; budgets: typeof budgets }> = {},
) {
  await page.route("**/*", async (route) => {''',
    '''async function installDashboardMocks(
  page: Page,
  secondaryGate?: Promise<void>,
  overrides: Partial<{ financial: typeof financial; monthly: typeof monthly; budgets: typeof budgets }> = {},
) {
  await page.clock.setFixedTime(new Date("2026-09-16T12:00:00+02:00"));
  await page.route("**/*", async (route) => {''',
)

# Smart Brief must exercise the current consistency guardrails, not bypass them.
# Make its canonical financial/budget/forecast sources agree while preserving
# the intended +20 pp change and transition to no planned movements.
replace_once(
    "tests/e2e/inicio-smart-brief.spec.ts",
    '''    effectiveAmountCents: 100000,
    actualExpenseCents: 60000,
    remainingCents: 40000,
    progressBps: 6000,
    status: "on_track",''',
    '''    effectiveAmountCents: 100000,
    actualExpenseCents: 70000,
    remainingCents: 30000,
    progressBps: 7000,
    status: "on_track",''',
)
replace_once(
    "tests/e2e/inicio-smart-brief.spec.ts",
    '''const forecast = {
  summary: {
    projectedIncomeCents: 0,
    projectedExpenseCents: 0,
    projectedNetCents: 0,
    projectedClosingBalanceCents: 30000,
    plannedItems: 0,
  },
  items: [],
};''',
    '''const forecast = {
  period: {
    dateFrom: "2026-09-16",
    dateTo: "2026-10-16",
    accountId: null,
  },
  summary: {
    openingBalanceCents: 30000,
    projectedIncomeCents: 0,
    projectedExpenseCents: 0,
    projectedNetCents: 0,
    projectedClosingBalanceCents: 30000,
    plannedItems: 0,
  },
  items: [],
};''',
)
replace_once(
    "tests/e2e/inicio-smart-brief.spec.ts",
    '      budgetProgressBps: 4000,',
    '      budgetProgressBps: 5000,',
)

print("PRE-032 CI fixtures patched: calendar-stable and consistency-safe.")
