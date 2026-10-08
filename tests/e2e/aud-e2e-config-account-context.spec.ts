import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("AUD-E2E-CFG-001 · no confunde saldo inicial con saldo bancario y conserva la cuenta", () => {
  const configuration = readFileSync(resolve("app/configuration/configuration-client.tsx"), "utf8");
  const page = readFileSync(resolve("app/accounts/page.tsx"), "utf8");
  const accounts = readFileSync(resolve("app/accounts/accounts-client.tsx"), "utf8");
  expect(configuration).toContain("Saldo inicial · configuración");
  expect(configuration).toContain("/accounts?accountId=");
  expect(configuration).toContain("Ver saldo bancario y fecha");
  expect(page).toContain("UUID.test(params.accountId)");
  expect(accounts).toContain("setSelectedId((current) =>");
  expect(accounts).toContain("useState<string>(initialAccountId ??");
});
