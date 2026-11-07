import { expect, test } from "@playwright/test";

test("REC-UI-544 · el último enlace de Para revisar se puede pulsar con la barra móvil", async ({ page }) => {
  // A deliberately failed read produces the longest list of unavailable checks.
  // Every response is synthetic; this test must never access or write bank data.
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "temporarily_unavailable" }),
  }));

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 667 });
    await page.goto("/review");

    const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
    const lastAction = unavailable.getByRole("link", {
      name: "Abrir sección: Sincronización bancaria", exact: true,
    });

    await expect(lastAction).toBeVisible();
    await expect(lastAction).toHaveAttribute("href", "/configuration/source");

    // Reproduce reaching the end of a long mobile page; the fixed bottom
    // navigation must not intercept the last action or trap the user.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await lastAction.scrollIntoViewIfNeeded();
    const canHit = await lastAction.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const front = document.elementFromPoint(x, y);
      return Boolean(front && (front === element || element.contains(front)));
    });
    expect(canHit).toBe(true);

    await lastAction.click();
    await expect(page).toHaveURL(/\/configuration\/source(?:\?|$)/);
  }
});
