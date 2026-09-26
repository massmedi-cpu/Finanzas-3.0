import { expect, test } from "@playwright/test";

test.describe("PWA Android install", () => {
  test("captures the Chromium install prompt on login before authentication", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();

    await page.evaluate(() => {
      const target = window as Window & { __pwaPromptCalls?: number };
      target.__pwaPromptCalls = 0;

      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
      };
      event.prompt = async () => {
        target.__pwaPromptCalls = (target.__pwaPromptCalls ?? 0) + 1;
      };
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });

    const installButton = page.getByRole("button", { name: "Instalar Financial App en este dispositivo" });
    await expect(installButton).toBeVisible();
    await installButton.click();

    await expect.poll(() => page.evaluate(() => (window as Window & { __pwaPromptCalls?: number }).__pwaPromptCalls ?? 0)).toBe(1);
    await expect(installButton).toBeHidden();
  });

  test("does not advertise installation on login without a native install prompt", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Instalar Financial App en este dispositivo" })).toHaveCount(0);
  });
});
