import { expect, test } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { resolveEffectiveTransaction } from "../../src/domain/effective-transaction";
import type { Transaction, TransactionOverride } from "../../src/domain/models";

/** Isolated CPU laboratory: NOT backend/UI/production p95. */
const REPEATS = 12;
const WARMUPS = 2;
const BASE_DAY = Date.UTC(2022, 0, 1);
const DAY_MS = 86_400_000;

function sample(rows: number) {
  const transactions: Transaction[] = [];
  const overrides = new Map<string, TransactionOverride>();
  let expectedCount = 0, expectedCents = 0;
  const stamp = "2026-10-10T00:00:00.000Z";
  for (let i = 0; i < rows; i++) {
    const id = "syn-" + i;
    const accountId = "account-" + i % 4;
    const bankDate = new Date(BASE_DAY + i % 1640 * DAY_MS).toISOString().slice(0, 10);
    const amountCents = i % 17 === 0 ? 75_000 + i % 91 : -(100 + i % 101);
    const originalKind = i % 17 === 0 ? "income" : "expense";
    const duplicateState = i % 37 === 0 ? "confirmed" : "none";
    const overridden = i % 7 === 0;
    const excluded = overridden && i % 11 === 0;
    const kindOverride = overridden && i % 31 === 0 ? "transfer" : null;
    transactions.push({
      id, sourceRecordId: "source-" + i, sourceRowIdentity: "row-" + i,
      accountId, bankDate, conceptNormalized: "Synthetic merchant " + i % 63,
      merchantId: "merchant-" + i % 63, categoryId: "category-" + i % 17,
      kind: originalKind, amountCents, balanceAfterCents: null,
      reviewState: "confirmed", duplicateState, transferPairId: null,
      createdAt: stamp, updatedAt: stamp,
    });
    if (overridden) overrides.set(id, {
      id: "override-" + i, transactionId: id,
      conceptOverride: "Edited synthetic " + i,
      merchantIdOverride: null, merchantOverrideSet: false,
      categoryIdOverride: i % 3 === 0 ? null : "category-manual",
      categoryOverrideSet: true,
      kindOverride, excludedFromAnalytics: excluded,
      reviewStateOverride: null, note: null,
      createdAt: stamp, updatedAt: stamp,
    });
    // Expected is derived independently from the fixture rules, not the
    // production projection whose output is being verified.
    if (accountId === "account-2"
      && bankDate >= "2025-01-01" && bankDate <= "2026-06-30"
      && originalKind === "expense" && duplicateState === "none"
      && !excluded && kindOverride !== "transfer") {
      expectedCount++;
      expectedCents += amountCents;
    }
  }
  return { transactions, overrides, expectedCount, expectedCents };
}

function projectInMemory(data: ReturnType<typeof sample>) {
  let count = 0, cents = 0, overridesApplied = 0;
  for (const original of data.transactions) {
    const effective = resolveEffectiveTransaction(original, data.overrides.get(original.id) ?? null);
    if (effective.hasUserOverride) overridesApplied++;
    if (effective.accountId !== "account-2"
      || effective.bankDate < "2025-01-01" || effective.bankDate > "2026-06-30"
      || effective.kind !== "expense"
      || effective.duplicateState !== "none"
      || effective.excludedFromAnalytics) continue;
    count++;
    cents += effective.amountCents;
  }
  return { count, cents, overridesApplied };
}

for (const rows of [10_000, 50_000]) {
  test("CAP-001 · " + rows.toLocaleString("es-ES") + " synthetic rows preserve financial overrides and report 12 laboratory runs", async ({}, testInfo) => {
    test.setTimeout(120_000);
    const heapAtStart = process.memoryUsage().heapUsed;
    const data = sample(rows);
    const fixtureHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapAtStart);
    const sourceFirst = data.transactions[0].conceptNormalized;
    const sourceLast = data.transactions.at(-1)?.amountCents;
    for (let warmup = 0; warmup < WARMUPS; warmup++) {
      const result = projectInMemory(data);
      expect(result.count).toBe(data.expectedCount);
      expect(result.cents).toBe(data.expectedCents);
    }
    const timingsMs: number[] = [];
    for (let repetition = 0; repetition < REPEATS; repetition++) {
      const started = performance.now();
      const actual = projectInMemory(data);
      timingsMs.push(performance.now() - started);
      expect(actual.count, "repetition " + repetition).toBe(data.expectedCount);
      expect(actual.cents, "repetition " + repetition).toBe(data.expectedCents);
      expect(actual.overridesApplied).toBe(data.overrides.size);
    }
    expect(data.transactions[0].conceptNormalized).toBe(sourceFirst);
    expect(data.transactions.at(-1)?.amountCents).toBe(sourceLast);
    const sorted = [...timingsMs].sort((a, b) => a - b);
    const report = {
      laboratory: "isolated Node/V8, synthetic effective-transaction projection only",
      sampleSize: rows, warmups: WARMUPS, repetitions: REPEATS,
      sourceAccountReadOnly: true, noPersistenceOrNetwork: true,
      fixtureHeapMiB: +(fixtureHeapBytes / 1048576).toFixed(2),
      expectedExpenseCount: data.expectedCount,
      expectedExpenseCents: data.expectedCents,
      medianMs: +((sorted[5] + sorted[6]) / 2).toFixed(2),
      p95LaboratoryMs: +sorted[Math.ceil(REPEATS * .95) - 1].toFixed(2),
      minMs: +sorted[0].toFixed(2), maxMs: +sorted.at(-1)!.toFixed(2),
      samplesMs: timingsMs.map(ms => +ms.toFixed(2)),
      acceptanceScope: "DOES NOT certify database, UI, API, mobile or production latency",
    };
    await testInfo.attach("financial-projection-" + rows + ".json", {
      body: Buffer.from(JSON.stringify(report, null, 2)), contentType: "application/json",
    });
    console.log("CAPACITY_FINANCIAL_PROJECTION " + JSON.stringify(report));
  });
}
