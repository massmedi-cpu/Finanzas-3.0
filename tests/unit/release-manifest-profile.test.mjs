import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHA = "b".repeat(40);
const DIGEST = "a".repeat(64);
const DEFERRED = { documents: false, documentOcr: false, documentDriveSync: false };
const FULL = { documents: true, documentOcr: true, documentDriveSync: true };

function runManifest(version, releaseFeatures) {
  const dir = mkdtempSync(join(tmpdir(), "financial-release-profile-"));
  const input = join(dir, "build.json");
  const output = join(dir, "manifest.json");
  const build = {
    releaseSchemaVersion: 1, version, targetVersion: version,
    releaseTag: "v" + version, commit: SHA,
    deploymentId: "dpl_SyntheticProduction123", environment: "production",
    releaseDeployable: true, artifactAlgorithm: "sha256",
    artifactScope: "deployment-provenance-v1", artifactDigest: DIGEST,
    releaseId: "financial-app@" + version + "+" + DIGEST.slice(0, 16),
    ...(releaseFeatures === undefined ? {} : { releaseFeatures }),
  };
  try {
    writeFileSync(input, JSON.stringify(build), "utf8");
    const run = spawnSync(process.execPath, [
      "--experimental-strip-types", "scripts/create-release-manifest.mjs",
      "--build-info", input, "--output", output,
      "--expected-sha", SHA, "--tag", "v" + version,
      "--expected-environment", "production",
      "--verified-at", "2026-11-13T00:00:00.000Z",
    ], { cwd: ROOT, encoding: "utf8", timeout: 15_000, env: { ...process.env, NODE_OPTIONS: "" } });
    return { status: run.status, output: run.stdout + run.stderr,
      manifest: existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : null };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("REC-REL-705 · historical stable 10.0.103 does not acquire a new feature gate", () => {
  const run = runManifest("10.0.103", undefined);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.manifest.releaseFeatures, undefined);
});

test("REC-REL-706 · restricted 10.0.104 cannot be released as full", () => {
  const ok = runManifest("10.0.104", DEFERRED);
  assert.equal(ok.status, 0, ok.output);
  assert.deepEqual(ok.manifest.releaseFeatures, DEFERRED);
  for (const flags of [FULL, undefined, { ...DEFERRED, documents: true },
    { ...DEFERRED, documentOcr: "false" }]) {
    const rejected = runManifest("10.0.104", flags);
    assert.notEqual(rejected.status, 0, "restricted 10.0.104 must fail closed");
    assert.equal(rejected.manifest, null);
  }
});

test("REC-REL-707 · 10.0.105+ requires complete proven Production flags", () => {
  for (const version of ["10.0.105", "10.0.106", "10.1.0", "11.0.0"]) {
    const ok = runManifest(version, FULL);
    assert.equal(ok.status, 0, ok.output);
    assert.deepEqual(ok.manifest.releaseFeatures, FULL);
    for (const flags of [DEFERRED, undefined, { ...FULL, documentOcr: false },
      { ...FULL, documentDriveSync: "true" }, { documents: true }]) {
      const rejected = runManifest(version, flags);
      assert.notEqual(rejected.status, 0, version + ": incomplete profile accepted");
      assert.equal(rejected.manifest, null);
    }
  }
});
