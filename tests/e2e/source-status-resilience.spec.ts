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
