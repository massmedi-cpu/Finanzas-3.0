import { expect, test } from "@playwright/test";
import {
  OFFICIAL_GOOGLE_SOURCE_FILE_ID,
  GoogleSourceConnectionContractError,
  GoogleSourceRuntimeConfigurationError,
} from "../../src/infrastructure/google/google-source-runtime";
import { PersistenceGatewayError } from "../../src/infrastructure/persistence/vercel-supabase-gateway";
import { resolveSourceStatusFileId } from "../../app/api/source/google/sync/route";

test("CR-006 · la trazabilidad usa la conexión activa cuando está disponible", async () => {
  const sourceFileId = await resolveSourceStatusFileId(async () => ({
    sourceFileId: "oauth-source-file-test",
  }));

  expect(sourceFileId).toBe("oauth-source-file-test");
});

test("CR-006 · la trazabilidad persiste aunque Google esté desconectado o temporalmente no disponible", async () => {
  await expect(resolveSourceStatusFileId(async () => null)).resolves.toBe(OFFICIAL_GOOGLE_SOURCE_FILE_ID);
  await expect(
    resolveSourceStatusFileId(async () => {
      throw new GoogleSourceRuntimeConfigurationError(["clientId"]);
    }),
  ).resolves.toBe(OFFICIAL_GOOGLE_SOURCE_FILE_ID);
  await expect(
    resolveSourceStatusFileId(async () => {
      throw new GoogleSourceConnectionContractError();
    }),
  ).resolves.toBe(OFFICIAL_GOOGLE_SOURCE_FILE_ID);
  await expect(
    resolveSourceStatusFileId(async () => {
      throw new PersistenceGatewayError("transient", 503, "gateway_unavailable");
    }),
  ).resolves.toBe(OFFICIAL_GOOGLE_SOURCE_FILE_ID);
});

test("CR-006 · la UI conserva la trazabilidad aunque Google no esté configurado", async ({ page }) => {
  const syncRun = {
    id: "11111111-1111-4111-8111-111111111111",
    sourceFileId: OFFICIAL_GOOGLE_SOURCE_FILE_ID,
    sourceRevision: "drive-version:97",
    status: "success",
    startedAt: "2026-09-05T13:06:26.166Z",
    finishedAt: "2026-09-05T13:06:26.166Z",
    rowsSeen: 3172,
    rowsInserted: 0,
    rowsRevised: 0,
    rowsSkipped: 3172,
    rowsFailed: 0,
    duplicatesDetected: 984,
    warningsCount: 0,
    errorCode: null,
    errorMessage: null,
  };

  const syncCursors = [
    {
      sourceFileId: OFFICIAL_GOOGLE_SOURCE_FILE_ID,
      sourceSheetId: "sheet-1",
      sourceRevision: "drive-version:97",
      lastSourceRowKey: "ROW-3172",
      lastSuccessfulRunId: syncRun.id,
      updatedAt: "2026-09-10T18:28:54.909Z",
    },
  ];

  await page.route("**/api/source/google/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, connection: null, missing: ["clientId"] }),
    });
  });
  await page.route("**/api/health/source-runtime", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        compatible: true,
        capabilities: { contractVersion: 2, sourceAccountLifecycle: true, canonicalProductSelection: true },
      }),
    });
  });
  await page.route("**/api/source/google/sync", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: syncRun, cursors: syncCursors }),
    });
  });

  await page.goto("/configuration/source");

  await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Última sincronización persistida" })).toBeVisible();
  await expect(page.getByText("3172", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Duplicados detectados en esa ejecución", { exact: true })).toBeVisible();
  await expect(page.getByText("984", { exact: true })).toBeVisible();
  await expect(page.getByText("Todavía no existe una sincronización real persistida para esta fuente.")).toHaveCount(0);
  await expect(page.getByText("ROW-3172", { exact: true })).toBeVisible();
});
