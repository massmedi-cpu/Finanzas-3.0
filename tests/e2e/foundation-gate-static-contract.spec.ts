import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { runCompleteFoundationHealthChecks } from "../../src/core/foundation-gate";

test("Axioma · los fundamentos se validan en CI sin penalizar cada apertura de Inicio", async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "la puerta de fundamentos se ejecuta una vez por run",
  );

  const health = runCompleteFoundationHealthChecks();
  expect(
    health.status,
    health.checks
      .filter((check) => !check.passed)
      .map((check) => check.name)
      .join(", "),
  ).toBe("ok");

  const homeSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
  expect(homeSource).not.toContain("runCompleteFoundationHealthChecks");
  expect(homeSource).not.toContain('dynamic = "force-dynamic"');
});
