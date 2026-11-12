import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedProductionDocumentProfile,
  requiresDualProductionDomainCheck,
} from "../../src/domain/release-production-profile.ts";

const DEFERRED = { documents: false, documentOcr: false, documentDriveSync: false };
const FULL = { documents: true, documentOcr: true, documentDriveSync: true };

test("REC-REL-701 · historic production versions retain their pre-existing profile", () => {
  for (const version of ["0.0.0", "9.9.999", "10.0.102", "10.0.103"]) {
    assert.equal(expectedProductionDocumentProfile(version), null);
    assert.equal(requiresDualProductionDomainCheck(version), false);
  }
});

test("REC-REL-702 · restricted 10.0.104 can never masquerade as full Documents/OCR", () => {
  assert.deepEqual(expectedProductionDocumentProfile("10.0.104"), DEFERRED);
  assert.equal(requiresDualProductionDomainCheck("10.0.104"), true);
  assert.notDeepEqual(expectedProductionDocumentProfile("10.0.104"), FULL);
});

test("REC-REL-703 · every subsequent production version requires Documents, OCR and Drive sync", () => {
  for (const version of ["10.0.105", "10.0.106", "10.0.999", "10.1.0", "11.0.0", "12.0.1"]) {
    assert.deepEqual(expectedProductionDocumentProfile(version), FULL, version);
    assert.equal(requiresDualProductionDomainCheck(version), true);
  }
});

test("REC-REL-704 · invalid or overflow release identity always fails closed", () => {
  for (const value of ["", "10.0", "10.0.104.1", "10.0.0105a", "10.0.99999999999999999", "candidate"]) {
    assert.throws(() => expectedProductionDocumentProfile(value), /invalid_release_version/);
    assert.throws(() => requiresDualProductionDomainCheck(value), /invalid_release_version/);
  }
});
