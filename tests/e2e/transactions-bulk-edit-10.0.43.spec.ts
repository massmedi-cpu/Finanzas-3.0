import { expect, test } from "@playwright/test";
import { buildBulkTransactionPatch } from "../../src/application/transaction-bulk-edit";

test("bulk transaction edit composes only safe reversible fields", () => {
  const patch = buildBulkTransactionPatch({
    category: { mode: "set", id: "11111111-1111-4111-8111-111111111111" },
    merchant: { mode: "set", id: "22222222-2222-4222-8222-222222222222" },
    reviewState: "confirmed",
    analytics: "exclude",
  });

  expect(patch).toEqual({
    categoryMode: "set",
    categoryId: "11111111-1111-4111-8111-111111111111",
    merchantMode: "set",
    merchantId: "22222222-2222-4222-8222-222222222222",
    reviewState: "confirmed",
    excludedFromAnalytics: true,
  });
  expect(patch).not.toHaveProperty("kind");
  expect(patch).not.toHaveProperty("concept");
  expect(patch).not.toHaveProperty("note");
});

test("bulk transaction edit restores detected values and can include analytics", () => {
  expect(buildBulkTransactionPatch({
    category: { mode: "inherit" },
    merchant: { mode: "inherit" },
    reviewState: "needs_review",
    analytics: "include",
  })).toEqual({
    categoryMode: "inherit",
    merchantMode: "inherit",
    reviewState: "needs_review",
    excludedFromAnalytics: false,
  });
});

test("unchanged bulk transaction edit produces an empty patch", () => {
  expect(buildBulkTransactionPatch({
    category: { mode: "unchanged" },
    merchant: { mode: "unchanged" },
    reviewState: null,
    analytics: "unchanged",
  })).toEqual({});
});

test("bulk edit supports explicit no-category and no-merchant overrides", () => {
  expect(buildBulkTransactionPatch({
    category: { mode: "set", id: null },
    merchant: { mode: "set", id: null },
    reviewState: "pending",
    analytics: "unchanged",
  })).toEqual({
    categoryMode: "set",
    categoryId: null,
    merchantMode: "set",
    merchantId: null,
    reviewState: "pending",
  });
});
