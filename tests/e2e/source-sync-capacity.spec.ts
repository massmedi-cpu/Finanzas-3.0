import { expect, test } from "@playwright/test";
import { performance } from "node:perf_hooks";
import {
  MAX_SOURCE_SYNC_OBSERVATIONS,
  prepareOfficialSourceSyncBatch,
} from "../../src/application/source-sync-service";
import { parseOfficialSourceRow } from "../../src/domain/official-bank-source";
import {
  encodePersistenceGatewayRequest,
} from "../../src/infrastructure/persistence/vercel-supabase-gateway";
import { pre025SourceRow, pre025Workbook } from "../fixtures/pre025-source";

const MIB = 1024 * 1024;
const MAX_DECOMPRESSED_GATEWAY_BYTES = 16 * MIB;
const MAX_COMPRESSED_GATEWAY_BYTES = 2 * MIB;

function measured<T>(operation: () => T) {
  const memoryBefore = process.memoryUsage();
  const started = performance.now();
  const value = operation();
  const elapsedMs = performance.now() - started;
  const memoryAfter = process.memoryUsage();
  const retainedHeapBytes = Math.max(0, memoryAfter.heapUsed - memoryBefore.heapUsed);
  const retainedRssBytes = Math.max(0, memoryAfter.rss - memoryBefore.rss);
  return { value, elapsedMs, retainedHeapBytes, retainedRssBytes };
}

test("PRE-025 baseline parses one observation within the isolated budget", () => {
  const result = measured(() => parseOfficialSourceRow({
    sourceFileId: "pre025-single-source",
    sourceSheetId: "725351515",
    sheetTitle: "Cuenta corriente · 3967",
    values: pre025SourceRow({ key: "CC-PRE025-SINGLE", product: "checking" }),
  }));

  expect(result.value.observation.amountCents).toBe(0);
  expect(result.elapsedMs).toBeLessThan(100);
  expect(result.retainedHeapBytes).toBeLessThan(16 * MIB);
  expect(result.retainedRssBytes).toBeLessThan(32 * MIB);
});

for (const budget of [
  { rows: 3_000, maxMs: 3_000, maxHeapBytes: 160 * MIB, maxRssBytes: 192 * MIB },
  { rows: MAX_SOURCE_SYNC_OBSERVATIONS, maxMs: 10_000, maxHeapBytes: 384 * MIB, maxRssBytes: 512 * MIB },
] as const) {
  test(`PRE-025 prepares and encodes ${budget.rows.toLocaleString("en-US")} observations within budget`, async ({}, testInfo) => {
    const workbook = pre025Workbook(budget.rows);
    const prepared = measured(() => prepareOfficialSourceSyncBatch(workbook));
    const encoded = encodePersistenceGatewayRequest("source.sync_batch", { batch: prepared.value });
    const report = {
      rows: budget.rows,
      elapsedMs: Math.round(prepared.elapsedMs * 10) / 10,
      retainedHeapMiB: Math.round((prepared.retainedHeapBytes / MIB) * 10) / 10,
      retainedRssMiB: Math.round((prepared.retainedRssBytes / MIB) * 10) / 10,
      originalPayloadMiB: Math.round((encoded.originalBytes / MIB) * 10) / 10,
      encodedPayloadMiB: Math.round((encoded.encodedBytes / MIB) * 10) / 10,
      encoding: encoded.contentEncoding ?? "identity",
    };

    await testInfo.attach(`pre025-source-capacity-${budget.rows}.json`, {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(`PRE025_SOURCE_CAPACITY ${JSON.stringify(report)}`);

    expect(prepared.value.observations).toHaveLength(budget.rows);
    expect(prepared.elapsedMs).toBeLessThan(budget.maxMs);
    expect(prepared.retainedHeapBytes).toBeLessThan(budget.maxHeapBytes);
    expect(prepared.retainedRssBytes).toBeLessThan(budget.maxRssBytes);
    expect(encoded.originalBytes).toBeLessThanOrEqual(MAX_DECOMPRESSED_GATEWAY_BYTES);
    expect(encoded.encodedBytes).toBeLessThanOrEqual(MAX_COMPRESSED_GATEWAY_BYTES);
    expect(encoded.contentEncoding).toBe("gzip");
  });
}
