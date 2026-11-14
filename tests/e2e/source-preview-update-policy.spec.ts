import { expect, test } from "@playwright/test";
import { isBankSourceWriteDisabled } from "../../src/application/source-preview-update-policy";

// Public environment metadata, not a browser claim, owns this decision.
// The backend source.sync_batch preview 403 stays authoritative.
test("REC-SYNC-640 · preview does not advertise bank-source writes", () => {
  expect(isBankSourceWriteDisabled("preview")).toBe(true);
  expect(isBankSourceWriteDisabled("production")).toBe(false);
  expect(isBankSourceWriteDisabled("development")).toBe(false);
  expect(isBankSourceWriteDisabled(undefined)).toBe(false);
});
