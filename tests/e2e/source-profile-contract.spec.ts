import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("PRE-002 · la fuente bancaria personal queda detrás de un BankSourceContract reusable y read-only", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato de fuente se valida una vez por run");

  const root = process.cwd();
  const contractPath = join(root, "src/domain/bank-source-contract.ts");
  const profilePath = join(root, "src/infrastructure/google/openbank-source-profile.ts");

  expect(existsSync(contractPath), "PRE-002 exige una frontera BankSourceContract explícita").toBe(true);
  expect(existsSync(profilePath), "PRE-002 exige conservar Openbank como adaptador/perfil concreto").toBe(true);

  const contract = readFileSync(contractPath, "utf8");
  const profile = readFileSync(profilePath, "utf8");
  const runtime = readFileSync(join(root, "src/infrastructure/google/google-source-runtime.ts"), "utf8");
  const reader = readFileSync(join(root, "src/infrastructure/google/official-bank-source-reader.ts"), "utf8");

  expect(contract).toContain("BankSourceContract");
  expect(contract).toContain("readOnly: true");
  expect(contract).toContain("prepareSyncBatch");

  expect(profile).toContain("openbank-personal-v1");
  expect(profile).toContain("OPENBANK_PERSONAL_SOURCE_PROFILE");
  expect(profile).toContain("prepareOfficialSourceSyncBatch");

  expect(runtime, "el runtime debe depender del perfil y no volver a codificar el parser Openbank").toContain(
    "OPENBANK_PERSONAL_SOURCE_PROFILE",
  );
  expect(runtime).toContain("sourceProfile");

  expect(reader).toContain("https://www.googleapis.com/auth/spreadsheets.readonly");
  expect(reader).toContain("https://www.googleapis.com/auth/drive.metadata.readonly");
  expect(reader).not.toContain("https://www.googleapis.com/auth/spreadsheets\"");
  expect(reader).not.toContain("https://www.googleapis.com/auth/drive\"");
});
