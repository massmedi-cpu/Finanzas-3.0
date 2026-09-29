import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/transactions/transactions-client.tsx", import.meta.url), "utf8");
const helper = readFileSync(new URL("../src/application/transaction-bulk-edit.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/transactions/route.ts", import.meta.url), "utf8");

for (const marker of ["bulk-category", "bulk-merchant", "bulk-review-state", "bulk-analytics", "bulk-apply"]) {
  if (!client.includes(`data-testid=\"${marker}\"`)) throw new Error(`bulk_edit_ui_missing:${marker}`);
}
if (!client.includes("buildBulkTransactionPatch")) throw new Error("bulk_edit_helper_not_used");
for (const field of ["categoryMode", "categoryId", "merchantMode", "merchantId", "reviewState", "excludedFromAnalytics"]) {
  if (!helper.includes(`patch.${field}`)) throw new Error(`bulk_edit_safe_field_missing:${field}`);
  if (!api.includes(`\"${field}\"`)) throw new Error(`bulk_edit_api_field_missing:${field}`);
}
for (const forbidden of ["patch.kind", "patch.concept", "patch.note"]) {
  if (helper.includes(forbidden)) throw new Error(`bulk_edit_sensitive_field_enabled:${forbidden}`);
}
for (const reset of ["setBulkCategory(UNCHANGED)", "setBulkMerchant(UNCHANGED)", "setBulkReviewState(UNCHANGED)", "setBulkAnalytics(UNCHANGED)"]) {
  if (!client.includes(reset)) throw new Error(`bulk_edit_reset_missing:${reset}`);
}
if (!client.includes("MAX_TRANSACTION_PATCH_SIZE")) throw new Error("bulk_edit_patch_limit_missing");

console.log(JSON.stringify({
  status: "transactions_bulk_edit_contract_ok",
  fields: ["category", "merchant", "reviewState", "analytics"],
  deferred: ["kind", "concept", "note"],
  bankSourceMutation: false,
}));
