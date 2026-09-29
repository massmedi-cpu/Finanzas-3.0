import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expectedStorageObjectSize,
  resolveStorageServerCredential,
} from "../../scripts/supabase-storage-credential-v2.mjs";

test("backup v2 prefers the modern Supabase secret key when both server credentials exist", () => {
  const credential = resolveStorageServerCredential({
    secretKey: "sb_secret_current",
    serviceRoleKey: "legacy-service-role-jwt",
  });

  assert.equal(credential?.kind, "secret");
  assert.deepEqual(credential?.headers, { apikey: "sb_secret_current" });
  assert.equal("Authorization" in credential.headers, false);
});

test("backup v2 keeps service_role as a legacy fallback", () => {
  const credential = resolveStorageServerCredential({
    serviceRoleKey: "legacy-service-role-jwt",
  });

  assert.equal(credential?.kind, "service_role");
  assert.deepEqual(credential?.headers, {
    apikey: "legacy-service-role-jwt",
    Authorization: "Bearer legacy-service-role-jwt",
  });
});

test("backup v2 fails closed when no private Storage server credential exists", () => {
  assert.equal(resolveStorageServerCredential(), null);
  assert.equal(resolveStorageServerCredential({ secretKey: "", serviceRoleKey: "" }), null);
});

test("Storage metadata size accepts absent metadata and exact non-negative integers", () => {
  assert.equal(expectedStorageObjectSize(undefined), null);
  assert.equal(expectedStorageObjectSize({ size: null }), null);
  assert.equal(expectedStorageObjectSize({ size: 0 }), 0);
  assert.equal(expectedStorageObjectSize({ size: "123" }), 123);
});

test("Storage metadata size rejects malformed, fractional and negative values", () => {
  for (const size of ["", "abc", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => expectedStorageObjectSize({ size }),
      /Storage object metadata contains an invalid size\./,
    );
  }
});
