import { expect, test } from "@playwright/test";

// REC-AUTH-LOGOUT-DRAFT · Synthetic document metadata only.
// A session-ending action must respect the existing unsaved-edit guard
// before POST /api/auth/logout. No originals, owner data or financial writes.
const documentId = "a9000000-0000-4000-8000-000000000091";
const document = {
  id: documentId,
  type: "invoice",
  notes: "",
  status: "pending_review",
  mimeType: "application/pdf",
  createdAt: "2026-11-01T09:00:00Z",
  updatedAt: "2026-11-01T09:00:00Z",
  sizeBytes: 1234,
  issuerName: "Emisor ficticio",
  totalCents: 1999,
  documentDate: "2026-11-01",
  storageProvider: "supabase",
  originalFileName: "factura-sintetica-salida.pdf",
  associationCount: 0,
  sourceModifiedAt: "2026-11-01T09:00:00Z",
  sourceDriveFileId: null,
};
const principles = {
  bankSource: "read_only",
  ocrEnabled: false,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
};

for (const width of [1280, 390]) {
  test(`REC-AUTH-LOGOUT-DRAFT · ${width}px exige confirmar antes de salir de una ficha editada`,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 860 });
      let logoutAttempts = 0;
      let documentWrites = 0;

      await page.route("**/api/auth/logout", async (route) => {
        logoutAttempts++;
        expect(route.request().method()).toBe("POST");
        await route.fulfill({ status: 200, json: { ok: true } });
      });
      await page.route("**/api/documents/ocr-review*", async (route) => {
        await route.fulfill({ status: 200, json: { documentId, runs: [], reviews: [] } });
      });
      await page.route("**/api/documents*", async (route) => {
        if (route.request().method() !== "GET") {
          documentWrites++;
          await route.fulfill({ status: 503, json: { error: "writes_forbidden" } });
          return;
        }
        const url = new URL(route.request().url());
        const response = url.searchParams.has("id")
          ? { contractVersion: 1, document, associations: [], principles }
          : { contractVersion: 1, items: [document], total: 1, limit: 50, offset: 0, principles };
        await route.fulfill({ status: 200, json: response });
      });
      await page.route("**/api/transactions*", async (route) => {
        await route.fulfill({ status: 200, json: { rows: [], totalCount: 0, hasMore: false, nextCursor: null } });
      });

      await page.goto("/documents");
      await page.getByRole("button", { name: /factura-sintetica-salida\.pdf/ }).click();
      const issuer = page.getByLabel("Emisor", { exact: true });
      await issuer.fill("EDICIÓN QUE NO SE DEBE PERDER");
      await expect(page.getByTestId("document-metadata-dirty")).toBeVisible();

      async function chooseLogout() {
        if (width <= 600) {
          const menu = page.getByRole("navigation", { name: "Más secciones" });
          const exit = menu.getByRole("link", { name: "Cerrar sesión de Financial App" });
          if (!(await exit.isVisible())) {
            await page.getByRole("navigation", { name: "Navegación móvil" })
              .getByRole("button", { name: "Más" }).click();
          }
          await exit.click();
        } else {
          await page.getByRole("link", { name: "Cerrar sesión de Financial App" }).click();
        }
      }

      await chooseLogout();
      const guard = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
      await expect(guard).toBeVisible();
      await expect(page).toHaveURL(/\/documents$/);
      expect(logoutAttempts).toBe(0);
      expect(documentWrites).toBe(0);
      await guard.getByRole("button", { name: "Seguir editando" }).click();
      await expect(issuer).toHaveValue("EDICIÓN QUE NO SE DEBE PERDER");
      await expect(guard).toHaveCount(0);
      expect(logoutAttempts).toBe(0);

      await chooseLogout();
      await expect(guard).toBeVisible();
      await guard.getByRole("button", { name: "Descartar cambios" }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(logoutAttempts).toBe(1);
      expect(documentWrites).toBe(0);
    });
}
