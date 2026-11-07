import test from "node:test";
import assert from "node:assert/strict";
import { matchesRequestedSplit } from "../../src/application/transactions/split-write-verification.ts";

const wanted = [
  { amountCents: -734, scope: "personal", categoryId: null, label: "Personal" },
  { amountCents: -500, scope: "other", categoryId: "category-1", label: "Otra persona" },
];
const snapshot = {
  exists: true, active: true, stale: false, bankAmountCents: -1234,
  sourceAmountCents: -1234, personalAmountCents: -734, otherAmountCents: -500,
  allocationCount: 2, allocations: wanted.map((line, position) => ({ ...line, position })),
};

test("only a complete, matching split verifies the requested financial result", () => {
  assert.equal(matchesRequestedSplit(snapshot, -1234, wanted), true);
  assert.equal(matchesRequestedSplit({ exists: true, bankAmountCents: -1234 }, -1234, wanted), false);
  assert.equal(matchesRequestedSplit({ ...snapshot, allocations: [...snapshot.allocations].reverse() }, -1234, wanted), false);
  assert.equal(matchesRequestedSplit({ ...snapshot, allocations: [snapshot.allocations[0], { ...snapshot.allocations[1], categoryId: null }] }, -1234, wanted), false);
  assert.equal(matchesRequestedSplit({ ...snapshot, otherAmountCents: -499 }, -1234, wanted), false);
  assert.equal(matchesRequestedSplit({ ...snapshot, stale: true }, -1234, wanted), false);
  assert.equal(matchesRequestedSplit(snapshot, -1235, wanted), false);
});

test("removal verifies only when no split remains", () => {
  const cleared = {
    exists: false, active: false, stale: false, bankAmountCents: -1234,
    sourceAmountCents: null, personalAmountCents: -1234, otherAmountCents: 0,
    allocationCount: 0, allocations: [],
  };
  assert.equal(matchesRequestedSplit(cleared, -1234, []), true);
  assert.equal(matchesRequestedSplit(snapshot, -1234, []), false);
  assert.equal(matchesRequestedSplit({ ...cleared, otherAmountCents: -1 }, -1234, []), false);
});

test("large cent values stay exact when checking the sum", () => {
  const parts = [
    { amountCents: Number.MAX_SAFE_INTEGER - 1, scope: "personal", categoryId: null, label: null },
    { amountCents: 1, scope: "other", categoryId: null, label: null },
  ];
  const large = {
    exists: true, active: true, stale: false, bankAmountCents: Number.MAX_SAFE_INTEGER,
    sourceAmountCents: Number.MAX_SAFE_INTEGER, personalAmountCents: Number.MAX_SAFE_INTEGER - 1,
    otherAmountCents: 1, allocationCount: 2,
    allocations: parts.map((line, position) => ({ ...line, position })),
  };
  assert.equal(matchesRequestedSplit(large, Number.MAX_SAFE_INTEGER, parts), true);
  assert.equal(matchesRequestedSplit({ ...large, otherAmountCents: 2 }, Number.MAX_SAFE_INTEGER, parts), false);
});
