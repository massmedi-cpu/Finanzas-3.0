import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { buildForecastScenarios, DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS } from '../../src/application/forecast/forecast-scenarios';

const dir = process.env.AUD_ISOLATED_DIR;
if (!dir || process.env.GITHUB_ACTIONS !== 'true') throw Error('isolated_ci_required');
const localStorageOrigin = new URL(process.env.SUPABASE_URL!).origin;
if (new URL(localStorageOrigin).hostname !== '127.0.0.1') throw Error('cloud_runtime_forbidden');
const canonicalStorageOrigin = 'https://btzukbfesxdratqnxuoj.supabase.co';
const context = async () => JSON.parse(await fs.readFile(`${dir}/context.json`, 'utf8'));
async function login(page: Page, account = 'owner') {
  const c = await context();
  const response = await page.request.post('/api/auth/login', { data: { email: c[account].email, password: c[account].password } });
  expect(response.status()).toBe(200);
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === canonicalStorageOrigin && url.pathname.startsWith('/storage/v1/')) {
      return route.continue({ url: localStorageOrigin + url.pathname + url.search });
    }
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  page.on('response', async response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && !response.ok()) {
      const body = await response.json().catch(() => ({}));
      console.log(`AUD_HTTP|diagnostic=api_error|method=${response.request().method()}|path=${new URL(response.url()).pathname}|status=${response.status()}|error=${body.error ?? ''}|code=${body.code ?? ''}`);
    }
  });
  return c;
}
async function api(page: Page, path: string, method = 'GET', data?: unknown) {
  const response = await page.request.fetch(path, { method, data, timeout: 90_000 });
  const body = await response.json();
  expect(response.ok(), `${method} ${path} ${response.status()} ${body.error ?? ''} ${body.code ?? ''}`).toBe(true);
  return body;
}
async function transaction(page: Page, id: string) {
  const result = await api(page, '/api/transactions?limit=100');
  const row = result.rows.find((item: any) => item.id === id);
  expect(row).toBeTruthy();
  return row;
}

test('HTTP boundary verifies signature/claims, Preview read-only and actual user isolation', async ({ page }) => {
  const c = await login(page);
  const tokens = JSON.parse(await fs.readFile(`${dir}/machine-tokens.json`, 'utf8'));
  const userToken = (await page.context().cookies()).find(cookie => cookie.name === 'financial_app_access')!.value;
  const gateway = async (token: string, action = 'account.list', user = userToken) => fetch('http://127.0.0.1:54331', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-financial-app-user-token': user, 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload: {} }),
  });
  for (const key of ['wrongOwner', 'wrongProject', 'wrongAudience', 'wrongIssuer', 'expired', 'wrongSignature']) {
    expect((await gateway(tokens[key])).status, key).toBe(401);
  }
  expect((await gateway('')).status).toBe(401);
  expect((await gateway(tokens.production, 'account.list', 'invalid-user')).status).toBe(401);
  expect((await gateway(tokens.preview)).status).toBe(200);
  expect((await gateway(tokens.preview, 'budget.set_manual')).status).toBe(403);
  expect((await gateway(tokens.preview, 'data.export_v1')).status).toBe(403);
  const ownerAccounts = await api(page, '/api/configuration');
  expect(ownerAccounts.accounts.some((a: any) => a.id === c.fixtureIds.account)).toBe(true);
  await page.request.post('/api/auth/logout');
  await login(page, 'foreign');
  expect((await api(page, '/api/configuration')).accounts).toEqual([]);
  expect((await page.request.get(`/api/documents?id=${c.documentId}`)).status()).toBe(404);
  expect((await page.request.patch('/api/budgets', { data: { month: '2026-10', categoryId: c.fixtureIds.categoryA, manualAmountCents: 999 } })).status()).toBe(404);
  await page.request.post('/api/auth/logout');
  await login(page, 'member');
  expect((await page.request.patch('/api/documents', { data: { action: 'test_designation', id: c.documentId,
    isTest: true, ownerReviewed: true, reason: 'Member must not designate' } })).status()).toBe(403);
  console.log('AUD_HTTP|case=boundary|signature_and_claims=true|preview_writes_denied=true|real_auth=true|cross_workspace_denied=true|signer=disposable_test_key');
});

test('financial API persists budgets, category, aliases, rule precedence, bulk edits and exact es-ES split', async ({ page }) => {
  test.setTimeout(180_000);
  const c = await login(page), ids = c.fixtureIds;
  const start = Date.now();
  for (const month of ['2026-09', '2026-10']) expect((await api(page, `/api/budgets?month=${month}`)).month).toBe(month);
  expect(Date.now() - start).toBeLessThan(30_000);
  for (const amount of [1732, 0, null]) {
    await api(page, '/api/budgets', 'PATCH', { month: '2026-09', categoryId: ids.categoryA, manualAmountCents: amount });
    const reloaded = await api(page, '/api/budgets?month=2026-09');
    expect(reloaded.categories.find((r: any) => r.categoryId === ids.categoryA).manualAmountCents).toBe(amount);
  }
  const category = (await api(page, '/api/configuration', 'POST', { operation: 'category.create', draft: {
    name: 'AUD manual category', kind: 'expense', parentCategoryId: null, iconKey: 'wallet', colorToken: 'category.blue', lifecycle: 'active', sortOrder: 1,
  } })).category;
  expect((await api(page, '/api/configuration')).categories.some((r: any) => r.id === category.id)).toBe(true);
  const merchant = (await api(page, '/api/merchants', 'POST', { operation: 'merchant.save', name: 'ChatGPT AUD', defaultCategoryId: ids.categoryA, lifecycle: 'active' })).merchant;
  const alias = (await api(page, '/api/merchants', 'POST', { operation: 'merchant_alias.save', merchantId: merchant.id, alias: 'CHATGPT AUD ALIAS' })).alias;
  expect((await api(page, '/api/merchants', 'POST', { operation: 'merchant.resolve', label: 'chatgpt aud alias' })).merchant.id).toBe(merchant.id);
  expect((await api(page, '/api/merchants')).aliases.some((r: any) => r.id === alias.id)).toBe(true);
  await page.goto('/configuration/rules');
  await page.getByRole('button', { name: '+ Nueva regla' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('AUD HTTP rule');
  await page.getByLabel('Concepto contiene').fill('AUD RULE SHOP');
  await page.getByLabel('Asignar categoría').selectOption(ids.categoryA);
  await page.getByLabel('Asignar comercio').selectOption(merchant.id);
  await page.getByRole('button', { name: 'Crear regla', exact: true }).click();
  await expect(page.locator('[data-action-id="rules:create"]')).toContainText('Regla guardada');
  await page.reload();
  await expect(page.getByText('AUD HTTP rule', { exact: true }).first()).toBeVisible();
  const before = await transaction(page, ids.rule);
  const simulation = await api(page, '/api/rules', 'POST', { operation: 'rule.evaluate', transactionId: ids.rule });
  expect(simulation.result.selectedRuleName).toBe('AUD HTTP rule');
  expect((await transaction(page, ids.rule)).category).toEqual(before.category);
  await api(page, '/api/rules', 'POST', { operation: 'rule.apply', transactionId: ids.rule });
  expect((await transaction(page, ids.rule)).merchant.effectiveId).toBe(merchant.id);
  await api(page, '/api/transactions', 'PATCH', { transactionIds: [ids.rule], patch: { categoryMode: 'set', categoryId: category.id } });
  expect((await api(page, '/api/rules', 'POST', { operation: 'rule.evaluate', transactionId: ids.rule })).result.categoryLocked).toBe(true);
  await api(page, '/api/rules', 'POST', { operation: 'rule.apply', transactionId: ids.rule });
  expect((await transaction(page, ids.rule)).category.effectiveId).toBe(category.id);
  await api(page, '/api/transactions', 'PATCH', { transactionIds: [ids.rec1, ids.rec2], patch: { note: 'AUD persisted bulk note', reviewState: 'confirmed' } });
  expect((await transaction(page, ids.rec1)).userNote).toBe('AUD persisted bulk note');
  expect((await transaction(page, ids.rec2)).userNote).toBe('AUD persisted bulk note');
  await api(page, '/api/transactions', 'PUT', { transactionId: ids.split, allocations: [
    { amountCents: -1000, scope: 'personal', categoryId: ids.categoryA, label: '10,00' },
    { amountCents: -732, scope: 'other', categoryId: null, label: '7,32' },
  ] });
  const split = await api(page, `/api/transactions?mode=split&transactionId=${ids.split}`);
  expect(split.bankAmountCents).toBe(-1732);
  expect(split.personalAmountCents).toBe(-1000);
  expect(split.otherAmountCents).toBe(-732);
  const invalid = await page.request.put('/api/transactions', { data: { transactionId: ids.split, allocations: [
    { amountCents: -1000, scope: 'personal', categoryId: ids.categoryA }, { amountCents: -730, scope: 'other', categoryId: null },
  ] } });
  expect(invalid.ok()).toBe(false);
  expect((await api(page, `/api/transactions?mode=split&transactionId=${ids.split}`)).otherAmountCents).toBe(-732);
  console.log('AUD_HTTP|case=financial_persistence|budgets_zero_null=true|category=true|alias=true|rule_ui_save_reload=true|simulation_read_only=true|manual_precedence=true|bulk_edit=true|split_exact=true');
});

test('recurrences and forecasts persist confirmation, exclusion, reconciliation, horizons and scenario signs', async ({ page }) => {
  test.setTimeout(180_000);
  const c = await login(page), ids = c.fixtureIds;
  const range = { dateFrom: '2026-06-01', dateTo: '2026-09-30', minOccurrences: 3 };
  const path = '/api/recurrences?' + new URLSearchParams({ dateFrom: range.dateFrom, dateTo: range.dateTo });
  const candidate = (await api(page, path)).candidates.find((r: any) => r.conceptPattern === 'aud monthly plan');
  expect(candidate.occurrenceCount).toBe(4);
  const saved = await api(page, '/api/recurrences', 'POST', { ...range, candidateKey: candidate.candidateKey, status: 'active' });
  const repeated = await api(page, '/api/recurrences', 'POST', { ...range, candidateKey: candidate.candidateKey, status: 'active' });
  expect(repeated.id).toBe(saved.id);
  await api(page, '/api/recurrences', 'PATCH', { id: saved.id, status: 'ignored' });
  expect((await api(page, path)).candidates.filter((r: any) => r.existingRecurrenceId === saved.id)).toHaveLength(1);
  expect((await api(page, path)).candidates.find((r: any) => r.existingRecurrenceId === saved.id).existingStatus).toBe('ignored');
  await api(page, '/api/recurrences', 'PATCH', { id: saved.id, status: 'active' });
  await api(page, '/api/forecast', 'POST', { action: 'refresh', dateFrom: '2026-10-01', dateTo: '2026-11-30', accountId: ids.account });
  const make = async (amountCents: number, accountId: string, suffix: string) => api(page, '/api/forecast', 'POST', {
    action: 'manual', date: '2026-10-15', concept: 'AUD HTTP ' + suffix, amountCents, accountId, categoryId: amountCents < 0 ? ids.categoryA : null,
    merchantId: null, confidence: 'high', idempotencyKey: randomUUID(),
  });
  const expense = await make(-70000, ids.account, 'expense');
  const income = await make(10000, ids.account, 'income');
  const zeroExpense = await make(-10000, ids.zeroAccount, 'zero expense');
  await make(10000, ids.zeroAccount, 'zero income');
  await make(100000, ids.negativeAccount, 'positive closing');
  const snapshot = (accountId: string, dateTo = '2026-10-31') => api(page, '/api/forecast?' + new URLSearchParams({ dateFrom: '2026-10-01', dateTo, accountId }));
  let snap = await snapshot(ids.account);
  expect(snap.summary.projectedClosingBalanceCents).toBeLessThan(0);
  expect(buildForecastScenarios(snap, DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS).find(r => r.key === 'conservative')!.closingBalanceCents).toBeLessThan(snap.summary.projectedClosingBalanceCents);
  expect((await snapshot(ids.zeroAccount)).summary.projectedClosingBalanceCents).toBe(0);
  expect((await snapshot(ids.negativeAccount)).summary.projectedClosingBalanceCents).toBeGreaterThan(0);
  const row = snap.items.find((r: any) => r.id === expense.id);
  await api(page, '/api/forecast', 'PATCH', { action: 'exclude', id: row.id, excluded: true, reason: 'AUD explicit exclusion', expectedUpdatedAt: row.updatedAt });
  snap = await snapshot(ids.account);
  expect(snap.items.find((r: any) => r.id === expense.id).affectsProjection).toBe(false);
  expect(snap.summary.projectedClosingBalanceCents).toBeGreaterThan(0);
  expect((await page.request.patch('/api/forecast', { data: { action: 'exclude', id: row.id, excluded: false, reason: '', expectedUpdatedAt: row.updatedAt } })).status()).toBe(409);
  const restored = snap.items.find((r: any) => r.id === expense.id);
  await api(page, '/api/forecast', 'PATCH', { action: 'exclude', id: expense.id, excluded: false, reason: '', expectedUpdatedAt: restored.updatedAt });
  const incomeRow = (await snapshot(ids.account)).items.find((r: any) => r.id === income.id);
  await api(page, '/api/forecast', 'PATCH', { action: 'reconcile', id: income.id, transactionId: ids.income, note: 'AUD explicit reconciliation', expectedUpdatedAt: incomeRow.updatedAt });
  expect((await snapshot(ids.account)).items.find((r: any) => r.id === income.id).status).toBe('confirmed');
  expect((await snapshot(ids.account, '2026-12-31')).period.dateTo).toBe('2026-12-31');
  expect((await snapshot(ids.zeroAccount)).items.some((r: any) => r.id === zeroExpense.id)).toBe(true);
  console.log('AUD_HTTP|case=recurrence_forecast|confirmed_idempotent=true|ignore_reload=true|manual_events=true|negative_zero_positive=true|scenario=true|exclude_reload=true|stale_write_denied=true|reconcile=true|horizon=true');
});

test('document original, genuine OCR, human review, associations, owner designation and export cross original Next routes', async ({ page }) => {
  test.setTimeout(300_000);
  const c = await login(page), ids = c.fixtureIds;
  await page.setContent('<main style="width:760px;padding:40px;background:white;color:black;font:34px Arial"><h1>FINANCIAL APP TEST</h1><h2>TICKET SINTETICO</h2><p>09/10/2026</p><p>ARTICULO A 10,00 EUR</p><p>ARTICULO B 9,00 EUR</p><h2>TOTAL 19,00 EUR</h2><p>SIN DATOS PERSONALES</p></main>');
  const png = await page.locator('main').screenshot({ type: 'png' });
  const uploaded = await api(page, '/api/documents', 'POST', { action: 'upload_sign', type: 'ticket', originalFileName: 'AUD-http-ticket.png', mimeType: 'image/png', sizeBytes: png.byteLength });
  const signed = new URL(uploaded.signedUrl);
  expect(signed.origin).toBe(canonicalStorageOrigin);
  const put = await fetch(localStorageOrigin + signed.pathname + signed.search, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
  expect(put.status).toBe(200);
  const finalized = await api(page, '/api/documents', 'POST', { action: 'upload_finalize', type: 'ticket', originalFileName: 'AUD-http-ticket.png', mimeType: 'image/png', path: uploaded.path });
  const id = finalized.document.id;
  const download = await page.request.get(`/api/documents/download?id=${id}`);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-disposition']).toContain('attachment;');
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(hash(await download.body())).toBe(hash(png));
  const raw = await api(page, `/api/documents/ocr?id=${id}`, 'POST');
  expect(raw.extractor).toContain('tesseract');
  expect(raw.plainText).toContain('19,00');
  const history = await api(page, `/api/documents/ocr-review?id=${id}`);
  expect(history.runs).toHaveLength(1);
  expect(history.runs[0].extractor).toBe(raw.extractor);
  await fs.writeFile(`${dir}/http-ocr.json`, JSON.stringify({ id, raw }), { mode: 0o600 });
  await api(page, '/api/documents/ocr-review', 'PATCH', { documentId: id, ocrRunId: history.runs[0].id, type: 'ticket', documentDate: '2026-10-09', documentTime: '12:34',
    issuerName: 'AUD HTTP reviewed issuer', totalCents: 1900, lineItems: [{ description: 'Reviewed article A', quantity: 1, unitPriceCents: 1000, totalCents: 1000 },
      { description: 'Reviewed article B', quantity: 1, unitPriceCents: 900, totalCents: 900 }], notes: 'AUD HTTP review' });
  expect((await api(page, `/api/documents?id=${id}`)).document.lineItems).toHaveLength(2);
  await api(page, '/api/documents', 'PATCH', { action: 'associate', documentId: id, transactionId: ids.rule, method: 'manual' });
  expect((await api(page, `/api/documents?id=${id}`)).associations.some((r: any) => r.transactionId === ids.rule)).toBe(true);
  expect((await api(page, `/api/documents?id=${c.documentId}`)).associations).toHaveLength(0);
  await api(page, '/api/documents', 'PATCH', { action: 'unassociate', documentId: id, transactionId: ids.rule });
  expect((await api(page, `/api/documents?id=${id}`)).associations).toHaveLength(0);
  await page.goto(`/documents?selectedId=${id}`);
  await page.getByRole('button', { name: /AUD-http-ticket.png/ }).click();
  await page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar metadatos', exact: true }) }).locator('textarea').fill('AUD persisted UI notes');
  await page.getByRole('button', { name: 'Guardar metadatos', exact: true }).click();
  await expect(page.getByTestId('document-metadata-dirty')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /AUD-http-ticket.png/ }).click();
  await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar metadatos', exact: true }) }).locator('textarea')).toHaveValue('AUD persisted UI notes');
  await page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar metadatos', exact: true }) }).locator('textarea').fill('AUD draft must survive failed save');
  const failSave = async (route: import('@playwright/test').Route) => route.request().method() === 'PATCH' ? route.abort() : route.continue();
  await page.route(/\/api\/documents$/, failSave);
  await page.getByRole('button', { name: 'Guardar metadatos', exact: true }).click();
  await expect(page.getByTestId('documents-alert')).toBeVisible();
  await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar metadatos', exact: true }) }).locator('textarea')).toHaveValue('AUD draft must survive failed save');
  await page.unroute(/\/api\/documents$/, failSave);
  await page.getByRole('link', { name: '← Inicio' }).click();
  const alert = page.getByRole('alertdialog', { name: 'Cambios sin guardar' });
  await expect(alert.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar metadatos', exact: true }) }).locator('textarea')).toHaveValue('AUD draft must survive failed save');
  await page.getByRole('link', { name: '← Inicio' }).click();
  await alert.getByRole('button', { name: 'Descartar cambios' }).click();
  expect((await api(page, `/api/documents?id=${id}`)).document.notes).toBe('AUD persisted UI notes');
  const designation = { action: 'test_designation', id, isTest: true, ownerReviewed: true, reason: 'Synthetic original reviewed by isolated owner' };
  await api(page, '/api/documents', 'PATCH', designation);
  expect((await api(page, '/api/documents?scope=ordinary')).items.some((r: any) => r.id === id)).toBe(false);
  expect((await api(page, '/api/documents?scope=tests')).items.some((r: any) => r.id === id)).toBe(true);
  await api(page, '/api/documents', 'PATCH', { ...designation, isTest: false, reason: 'Restore ordinary treatment' });
  expect(hash(await (await page.request.get(`/api/documents/download?id=${id}`)).body())).toBe(hash(png));
  const exported = await page.request.get('/api/data/export');
  expect(exported.status()).toBe(200);
  expect(exported.headers()['content-disposition']).toContain('financial-app-data-export.json');
  const data = await exported.json();
  expect(data.format).toBe('financial-app-workspace-json');
  expect(data.datasets.transactions).toHaveLength(11);
  expect(data.datasets.documents.some((r: any) => r.id === id)).toBe(true);
  expect(data.limitations).toContain('document_binaries_not_included');
  for (const forbidden of ['authorized_users', 'workspace_memberships', 'google_oauth_connections', 'vault.secrets', c.owner.password, c.owner.token]) expect(JSON.stringify(data)).not.toContain(forbidden);
  console.log('AUD_HTTP|case=document_export|original_hash=true|next_ocr_real=true|ocr_persist_reload=true|human_review=true|association_target_only=true|ui_save_reload=true|failed_save_preserves_draft=true|discard_no_write=true|designation_reversible=true|export_actual_download=true|secrets_excluded=true');
});

const routes = ['/', '/transactions', '/analysis', '/compare', '/cash-flow', '/accounts', '/budgets', '/recurrences', '/forecast', '/documents', '/alerts', '/review', '/onboarding', '/configuration',
  '/configuration/source', '/configuration/source/diagnostics', '/configuration/merchants', '/configuration/rules', '/configuration/preferences', '/configuration/appearance', '/configuration/data'];
// These routes request their data in the browser. Server-rendered routes below
// consume the same real gateway before rendering and need a loaded UI assertion.
const routeApi: Record<string, string> = { '/': '/api/dashboard', '/transactions': '/api/transactions',
  '/accounts': '/api/financial', '/budgets': '/api/budgets',
  '/recurrences': '/api/recurrences', '/documents': '/api/documents',
  '/configuration': '/api/configuration', '/configuration/merchants': '/api/merchants', '/configuration/rules': '/api/rules' };
const routeSelection: Record<string, string> = {
  '/analysis': '?month=2026-09&range=1m',
  '/compare': '?primaryFrom=2026-09-01&primaryTo=2026-09-30&referenceFrom=2026-08-01&referenceTo=2026-08-31',
  '/cash-flow': '?month=2026-09',
  '/budgets': '?month=2026-09',
  '/forecast': '?dateFrom=2026-10-01&dateTo=2026-10-31',
};
const serverRenderedSummary: Record<string, string> = {
  '/analysis': 'Indicadores principales del periodo',
  '/compare': 'Resumen comparativo',
  '/cash-flow': 'Resumen de Cash Flow',
  '/forecast': 'Resumen de previsión',
};
for (const width of [360, 390, 768, 820, 1024, 1348, 1440]) {
  test(`real-data UI sweep ${width}px, light/dark, complete module/configuration routes`, async ({ page }) => {
    test.setTimeout(360_000);
    await login(page);
    await page.setViewportSize({ width, height: 936 });
    const failed: string[] = [];
    page.on('pageerror', error => failed.push(error.message));
    for (const route of routes) {
      console.log(`AUD_HTTP|stage=ui_route|width=${width}|route=${route}`);
      const dataResponse = routeApi[route] ? page.waitForResponse(response => new URL(response.url()).pathname === routeApi[route]
        && response.request().method() === 'GET', { timeout: 60_000 }) : null;
      const response = await page.goto(route + (routeSelection[route] ?? ''));
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('#main-content'), route).toBeVisible();
      await expect(page.locator('h1').first(), route).toBeVisible();
      if (dataResponse) expect((await dataResponse).ok(), `${route} real API response`).toBe(true);
      if (serverRenderedSummary[route]) {
        await expect(page.getByRole('region', { name: serverRenderedSummary[route], exact: true })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/No se pudo preparar el análisis inicial|El comparador no está disponible ahora mismo|No se pudo cargar la previsión\./)).toHaveCount(0);
      }
      if (route === '/cash-flow') {
        await expect(page.getByText('No se han podido cargar juntos el resumen financiero y los movimientos reales.', { exact: false })).toHaveCount(0);
        await expect(page.getByText('No se pudo cargar el motor de Previsión.', { exact: false })).toHaveCount(0);
      }
      // Wait for actual route data where it exists, rather than only auditing a loader.
      await expect.poll(() => page.locator('main [aria-busy="true"]').count(), { timeout: 35_000 }).toBe(0);
      for (const theme of ['light', 'dark']) {
        await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const dimensions = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.html, `${route} ${theme}`).toBeLessThanOrEqual(dimensions.width + 1);
        expect(dimensions.body, `${route} ${theme}`).toBeLessThanOrEqual(dimensions.width + 1);
      }
    }
    expect(failed).toEqual([]);
    console.log(`AUD_HTTP|case=responsive|width=${width}|themes=light,dark|routes=${routes.length}|real_backend=true|page_errors=0|overflow=0`);
  });
}

test('real authenticated preferences, keyboard navigation, privacy, PWA and offline recovery', async ({ page, context: browserContext }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto('/configuration/appearance');
  await page.locator('input[name="density"][value="compact"]').check();
  await page.getByTestId('reduce-motion-toggle').check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.getByTestId('reduce-motion-toggle')).toBeChecked();
  await page.goto('/configuration/preferences');
  await page.getByLabel('Solo categorías con exceso o sin financiación').check();
  await page.reload();
  await expect(page.getByLabel('Solo categorías con exceso o sin financiación')).toBeChecked();
  await page.getByLabel('Ocultar la app cuando pierde el foco').check();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByText('Financial App protegida', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Financial App protegida', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const more = page.getByRole('navigation', { name: 'Navegación móvil' }).getByRole('button', { name: 'Más', exact: true });
  await more.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cerrar más secciones' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('navigation', { name: 'Más secciones' }).getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(more).toBeFocused();
  const manifest = await api(page, '/manifest.webmanifest');
  expect(manifest.display).toBe('standalone');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await browserContext.setOffline(true);
  await expect(page.getByTestId('offline-status')).toContainText('Sin conexión');
  expect(await page.evaluate(async () => { try { await fetch('/api/transactions?limit=1'); return true; } catch { return false; } })).toBe(false);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  await browserContext.setOffline(false);
  await expect(page.getByTestId('offline-status')).toHaveCount(0);
  expect((await api(page, '/api/transactions?limit=1')).rows).toHaveLength(1);
  console.log('AUD_HTTP|case=preferences_pwa|reload_persists=true|keyboard_focus=true|privacy_on_blur=true|service_worker_real=true|offline_private_cache_absent=true|recovery_real=true');
});
