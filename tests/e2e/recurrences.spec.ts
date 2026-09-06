import { expect, test } from "@playwright/test";
import { handleRecurrenceLogicAction } from "../../supabase/functions/financial-app-db-gateway/recurrence-logic";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const activeRecurrenceId = "71000000-0000-4000-8000-000000000071";
const confirmedRecurrenceId = "71000000-0000-4000-8000-000000000072";

const baseSnapshot = {
  contractVersion: 1,
  dateFrom: null,
  dateTo: "2026-09-06",
  minOccurrences: 3,
  candidateCount: 2,
  candidates: [
    {
      candidateKey: "candidate-expense",
      accountId: "10000000-0000-4000-8000-000000000071",
      merchantId: null,
      categoryId: null,
      kind: "expense",
      conceptPattern: "supermercado mensual",
      intervalUnit: "month",
      intervalCount: 1,
      usualAmountCents: -4250,
      amountToleranceCents: 350,
      dateToleranceDays: 3,
      confidence: "medium",
      observedConfidence: "medium",
      occurrenceCount: 4,
      firstObservedDate: "2026-05-10",
      lastObservedDate: "2026-08-10",
      nextEstimatedDate: "2026-09-10",
      missedCycles: 0,
      stale: false,
      existingRecurrenceId: null,
      existingStatus: null,
      explanation: "Patrón detectado sobre movimientos efectivos elegibles. La próxima fecha es posterior al periodo analizado y no implica confirmación automática.",
    },
    {
      candidateKey: "candidate-income",
      accountId: "10000000-0000-4000-8000-000000000071",
      merchantId: null,
      categoryId: null,
      kind: "income",
      conceptPattern: "ingreso periódico",
      intervalUnit: "month",
      intervalCount: 1,
      usualAmountCents: 150000,
      amountToleranceCents: 100,
      dateToleranceDays: 1,
      confidence: "medium",
      observedConfidence: "high",
      occurrenceCount: 6,
      firstObservedDate: "2026-03-01",
      lastObservedDate: "2026-08-01",
      nextEstimatedDate: "2026-10-01",
      missedCycles: 1,
      stale: true,
      existingRecurrenceId: activeRecurrenceId,
      existingStatus: "active",
      explanation: "Patrón detectado sobre movimientos efectivos elegibles. Se ha omitido un vencimiento teórico; la próxima fecha se proyecta después del periodo analizado y la confianza se reduce.",
    },
  ],
  principles: {
    bankSource: "read_only",
    factSource: "financial_transaction_facts",
    eligibleKinds: ["income", "expense"],
    automaticPersistence: false,
    confidenceExplicit: true,
    weakMatchesBecomeFacts: false,
    nextDateAfterAnalysisPeriod: true,
    missedCyclesReduceConfidence: true,
  },
};

async function mockRecurrenceApi(
  page: import("@playwright/test").Page,
  writes: Array<Record<string, unknown>>,
) {
  let current = structuredClone(baseSnapshot);

  await page.route("**/api/recurrences*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(current),
      });
      return;
    }

    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push({ method, ...body });

    if (method === "POST") {
      current = {
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.conceptPattern === body.conceptPattern
            ? {
                ...candidate,
                existingRecurrenceId: candidate.existingRecurrenceId ?? confirmedRecurrenceId,
                existingStatus: body.status as "active" | "ignored" | "archived",
              }
            : candidate,
        ),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: confirmedRecurrenceId, status: body.status }),
      });
      return;
    }

    if (method === "PATCH") {
      current = {
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.existingRecurrenceId === body.id
            ? { ...candidate, existingStatus: body.status as "active" | "ignored" | "archived" }
            : candidate,
        ),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: body.id, status: body.status }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "method_not_allowed" }),
    });
  });
}

test("recurrence API rejects invalid filters and writes before persistence", async ({ request }) => {
  const invalidDate = await request.get("/api/recurrences?dateFrom=2026-02-30");
  expect(invalidDate.status()).toBe(400);
  await expect(invalidDate.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_recurrence_date_from",
  });

  const invalidMinimum = await request.get("/api/recurrences?minOccurrences=2");
  expect(invalidMinimum.status()).toBe(400);
  await expect(invalidMinimum.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_recurrence_min_occurrences",
  });

  const invalidBody = await request.post("/api/recurrences", { data: [] });
  expect(invalidBody.status()).toBe(400);
  await expect(invalidBody.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_recurrence_body",
  });

  const invalidStatus = await request.patch("/api/recurrences", {
    data: { id: activeRecurrenceId, status: "confirmed" },
  });
  expect(invalidStatus.status()).toBe(400);
  await expect(invalidStatus.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_recurrence_status",
  });
});

test("recurrence gateway validates payloads before SQL", async () => {
  const sql = () => { throw new Error("sql_should_not_run"); };

  await expect(handleRecurrenceLogicAction({
    action: "recurrence.snapshot",
    payload: { dateFrom: "2026-02-30", dateTo: null, minOccurrences: 3 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_recurrence_date_from");

  await expect(handleRecurrenceLogicAction({
    action: "recurrence.snapshot",
    payload: { dateFrom: null, dateTo: null, minOccurrences: 2 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_recurrence_min_occurrences");

  await expect(handleRecurrenceLogicAction({
    action: "recurrence.save",
    payload: {
      id: null,
      accountId: null,
      merchantId: null,
      categoryId: null,
      conceptPattern: "Patrón",
      status: "confirmed",
      intervalUnit: "month",
      intervalCount: 1,
      usualAmountCents: -1000,
      amountToleranceCents: 100,
      dateToleranceDays: 2,
      nextEstimatedDate: "2026-10-01",
      confidence: "medium",
      occurrenceCount: 4,
      lastObservedDate: "2026-09-01",
    },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_recurrence_status");

  await expect(handleRecurrenceLogicAction({
    action: "recurrence.status",
    payload: { id: "not-a-uuid", status: "active" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_recurrence_id");
});

test("recurrence gateway classifies domain errors and hides database details", async () => {
  const missingSql = () => { throw new Error("recurrence_not_found"); };
  const missing = await handleRecurrenceLogicAction({
    action: "recurrence.status",
    payload: { id: activeRecurrenceId, status: "archived" },
    sql: missingSql,
    environment: "preview",
  });
  expect(missing?.status).toBe(404);
  await expect(missing?.json()).resolves.toEqual({ error: "recurrence_not_found" });

  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const failingSql = () => { throw new Error("sensitive_recurrence_sql_details_must_not_escape"); };
    const failure = await handleRecurrenceLogicAction({
      action: "recurrence.snapshot",
      payload: { dateFrom: null, dateTo: null, minOccurrences: 3 },
      sql: failingSql,
      environment: "preview",
    });
    expect(failure?.status).toBe(500);
    await expect(failure?.json()).resolves.toEqual({ error: "recurrence_internal_error" });
    expect(JSON.stringify(logged)).not.toContain("sensitive_recurrence_sql_details_must_not_escape");
  } finally {
    console.error = originalConsoleError;
  }
});

test("Recurrentes muestra confianza explícita, vigencia, formato español y controles accesibles", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockRecurrenceApi(page, writes);
  await page.goto("/recurrences");

  await expect(page.getByRole("heading", { name: "Patrones que se repiten, sin adivinar", level: 1 })).toBeVisible();
  await expect(page.getByText("supermercado mensual", { exact: true })).toBeVisible();
  await expect(page.getByText(/-42,50\s?€/).first()).toBeVisible();
  await expect(page.getByText("Confianza Media", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 ciclo no observado", { exact: true })).toBeVisible();
  await expect(page.getByText("Origen bancario · solo lectura", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ningún patrón se convierte en recurrencia confirmada/i)).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main button").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
  expect(writes).toHaveLength(0);
});

test("Recurrentes confirma, ignora y archiva decisiones explícitas", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockRecurrenceApi(page, writes);
  await page.goto("/recurrences");

  const expenseCard = page.locator("article").filter({ hasText: "supermercado mensual" });
  await expenseCard.getByRole("button", { name: "Confirmar recurrencia" }).click();
  await expect(page.getByRole("status")).toContainText("Recurrencia confirmada");
  expect(writes.at(-1)).toMatchObject({
    method: "POST",
    status: "active",
    conceptPattern: "supermercado mensual",
    intervalUnit: "month",
    intervalCount: 1,
    occurrenceCount: 4,
  });

  await expenseCard.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByRole("status")).toContainText("Recurrencia archivada");
  expect(writes.at(-1)).toMatchObject({
    method: "PATCH",
    id: confirmedRecurrenceId,
    status: "archived",
  });

  const incomeCard = page.locator("article").filter({ hasText: "ingreso periódico" });
  await incomeCard.getByRole("button", { name: "Ignorar" }).click();
  await expect(page.getByRole("status")).toContainText("Recurrencia ignorada");
  expect(writes.at(-1)).toMatchObject({
    method: "PATCH",
    id: activeRecurrenceId,
    status: "ignored",
  });
});

test("Recurrentes recalcula sin persistir hasta una decisión del usuario", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockRecurrenceApi(page, writes);
  await page.goto("/recurrences");
  await expect(page.getByRole("heading", { name: "Patrones que se repiten, sin adivinar", level: 1 })).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByRole("button", { name: "Recalcular patrones" }).click();
  await expect(page.getByRole("status")).toContainText("Patrones recalculados");
  expect(writes).toHaveLength(0);
});

test("protected preview identifies the exact Phase 7 recurrence build", async ({ request }) => {
  test.skip(!isProtectedPreview, "Exact deployment identity is a protected-preview gate.");

  const response = await request.get("/api/build");
  expect(response.ok()).toBeTruthy();
  const build = await response.json();

  expect(build.phase).toBe(7);
  expect(build.phaseName).toBe("Recurrentes");
  expect(build.phaseBlock).toBe(1);
  expect(build.phaseBlockName).toBe("Motor de recurrencias");
  expect(build.environment).toBe("preview");
  if (process.env.GITHUB_SHA) expect(build.commit).toBe(process.env.GITHUB_SHA);
});

test("protected preview exposes only future recurrence projections without automatic persistence", async ({ request }) => {
  test.skip(!isProtectedPreview, "Real recurrence detection is validated only against protected preview.");

  const response = await request.get("/api/recurrences?minOccurrences=3");
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();

  expect(snapshot.contractVersion).toBe(1);
  expect(snapshot.candidateCount).toBeGreaterThan(0);
  expect(snapshot.candidates).toHaveLength(snapshot.candidateCount);
  expect(snapshot.principles).toEqual({
    bankSource: "read_only",
    factSource: "financial_transaction_facts",
    eligibleKinds: ["income", "expense"],
    automaticPersistence: false,
    confidenceExplicit: true,
    weakMatchesBecomeFacts: false,
    nextDateAfterAnalysisPeriod: true,
    missedCyclesReduceConfidence: true,
  });
  for (const candidate of snapshot.candidates) {
    expect(["high", "medium", "low"]).toContain(candidate.confidence);
    expect(["high", "medium", "low"]).toContain(candidate.observedConfidence);
    expect(["week", "month", "quarter", "year"]).toContain(candidate.intervalUnit);
    expect(candidate.occurrenceCount).toBeGreaterThanOrEqual(3);
    expect(candidate.missedCycles).toBeGreaterThanOrEqual(0);
    expect(candidate.stale).toBe(candidate.missedCycles > 0);
    expect(candidate.nextEstimatedDate > snapshot.dateTo).toBeTruthy();
    if (candidate.missedCycles >= 2) expect(candidate.confidence).toBe("low");
    if (candidate.missedCycles === 1 && candidate.observedConfidence === "high") {
      expect(candidate.confidence).toBe("medium");
    }
  }
});
