import assert from "node:assert/strict";
import { shortFingerprint, summarizeIntegrityChecks, type IntegrityCheck } from "../lib/financial/integrity-shared";

const checks: IntegrityCheck[] = [
  { key: "source", label: "Fuente", status: "pass", detail: "ok" },
  { key: "sync", label: "Sincronización", status: "warning", detail: "review" },
  { key: "accounts", label: "Cuentas", status: "fail", detail: "broken" },
  { key: "archive", label: "Archivo", status: "pass", detail: "private" },
];

assert.deepEqual(summarizeIntegrityChecks(checks), { pass: 2, warning: 1, fail: 1 });
assert.equal(shortFingerprint("1234567890abcdef"), "1234567890ab");
assert.equal(shortFingerprint(null), "—");
assert.equal(shortFingerprint(undefined), "—");

console.log("Financial App 2.8 integrity tests OK · estados y huellas deterministas");
