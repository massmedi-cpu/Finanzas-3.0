export type BulkReviewState = "confirmed" | "pending" | "needs_review";

export type BulkTransactionEdit = {
  category:
    | { mode: "unchanged" }
    | { mode: "inherit" }
    | { mode: "set"; id: string | null };
  merchant:
    | { mode: "unchanged" }
    | { mode: "inherit" }
    | { mode: "set"; id: string | null };
  reviewState: BulkReviewState | null;
  analytics: "unchanged" | "include" | "exclude";
};

export function buildBulkTransactionPatch(edit: BulkTransactionEdit) {
  const patch: Record<string, unknown> = {};

  if (edit.category.mode === "inherit") {
    patch.categoryMode = "inherit";
  } else if (edit.category.mode === "set") {
    patch.categoryMode = "set";
    patch.categoryId = edit.category.id;
  }

  if (edit.merchant.mode === "inherit") {
    patch.merchantMode = "inherit";
  } else if (edit.merchant.mode === "set") {
    patch.merchantMode = "set";
    patch.merchantId = edit.merchant.id;
  }

  if (edit.reviewState !== null) {
    patch.reviewState = edit.reviewState;
  }

  if (edit.analytics === "include") {
    patch.excludedFromAnalytics = false;
  } else if (edit.analytics === "exclude") {
    patch.excludedFromAnalytics = true;
  }

  return patch;
}
