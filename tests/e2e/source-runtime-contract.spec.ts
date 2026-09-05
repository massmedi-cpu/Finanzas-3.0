import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import {
  SOURCE_SYNC_RUNTIME_CONTRACT_VERSION,
  SourceSyncRuntimeCompatibilityError,
  assertSourceSyncRuntimeCapabilities,
} from "../../src/application/source-sync-runtime-contract";
import {
  PERSISTENCE_GATEWAY_GZIP_THRESHOLD_BYTES,
  encodePersistenceGatewayRequest,
} from "../../src/infrastructure/persistence/vercel-supabase-gateway";

test("acepta únicamente el runtime de sincronización v2 con lifecycle y selección canónica", () => {
  const capabilities = {
    contractVersion: SOURCE_SYNC_RUNTIME_CONTRACT_VERSION,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
  };

  expect(() => assertSourceSyncRuntimeCapabilities(capabilities)).not.toThrow();
});

test("rechaza de forma fail-closed un runtime antiguo o incompleto", () => {
  const oldRuntime = {
    contractVersion: 1,
    sourceAccountLifecycle: false,
    canonicalProductSelection: false,
  };

  expect(() => assertSourceSyncRuntimeCapabilities(oldRuntime)).toThrow(
    SourceSyncRuntimeCompatibilityError,
  );
  expect(() => assertSourceSyncRuntimeCapabilities(null)).toThrow(
    SourceSyncRuntimeCompatibilityError,
  );
});

test("mantiene el gateway de persistencia colocado junto a PostgreSQL en eu-west-3", () => {
  const gatewaySource = readFileSync(
    "src/infrastructure/persistence/vercel-supabase-gateway.ts",
    "utf8",
  );

  expect(gatewaySource).toContain('const SUPABASE_GATEWAY_REGION = "eu-west-3";');
  expect(gatewaySource).toContain('"x-region": SUPABASE_GATEWAY_REGION');
});

test("mantiene JSON normal para peticiones pequeñas y gzip para batches grandes", () => {
  const smallPayload = { ok: true };
  const small = encodePersistenceGatewayRequest("health", smallPayload);
  expect(small.contentEncoding).toBeNull();
  expect(typeof small.body).toBe("string");
  expect(JSON.parse(small.body as string)).toEqual({ action: "health", payload: smallPayload });

  const largePayload = { rows: "A".repeat(PERSISTENCE_GATEWAY_GZIP_THRESHOLD_BYTES * 2) };
  const large = encodePersistenceGatewayRequest("source.sync_batch", largePayload);
  expect(large.contentEncoding).toBe("gzip");
  expect(large.body).toBeInstanceOf(Uint8Array);
  expect(large.encodedBytes).toBeLessThan(large.originalBytes);

  const roundTrip = JSON.parse(gunzipSync(large.body as Uint8Array).toString("utf8"));
  expect(roundTrip).toEqual({ action: "source.sync_batch", payload: largePayload });
});

test("el Edge gateway acepta gzip con límites defensivos y conserva JSON sin comprimir", () => {
  const edgeSource = readFileSync(
    "supabase/functions/financial-app-db-gateway/index.ts",
    "utf8",
  );

  expect(edgeSource).toContain('import { gunzipSync } from "node:zlib";');
  expect(edgeSource).toContain("MAX_COMPRESSED_GATEWAY_BODY_BYTES = 2 * 1024 * 1024");
  expect(edgeSource).toContain("MAX_DECOMPRESSED_GATEWAY_BODY_BYTES = 16 * 1024 * 1024");
  expect(edgeSource).toContain('contentEncoding !== "gzip"');
  expect(edgeSource).toContain("gunzipSync(bodyBytes)");
  expect(edgeSource).toContain('contentEncoding === "identity"');
  expect(edgeSource).toContain("await readGatewayJsonBody(req)");
});
