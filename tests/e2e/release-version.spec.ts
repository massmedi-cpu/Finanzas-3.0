import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { APP_VERSION, TARGET_VERSION, getBuildInfo } from "../../src/core/build-info";

const EXPECTED_LOCK_SEMANTIC_FINGERPRINT = "69ac752fc4f14d0bacccb4c8fde376a883f549e8c4b7c01cf31a900d392be95e";

function semanticLockFingerprint(packageLock: { version: string; packages?: Record<string, { version?: string }> }) {
  const normalized = structuredClone(packageLock);
  normalized.version = "__RELEASE_VERSION__";
  if (normalized.packages?.[""]) normalized.packages[""].version = "__RELEASE_VERSION__";
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

test("release · package, lock, build metadata y UI comparten una única versión", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la identidad de release se valida una vez por run");
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  const packageLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
    version: string;
    packages?: Record<string, { version?: string }>;
  };
  const buildSource = readFileSync(join(root, "src/core/build-info.ts"), "utf8");
  const layoutSource = readFileSync(join(root, "app/layout.tsx"), "utf8");
  const build = getBuildInfo();
  const lockFingerprint = semanticLockFingerprint(packageLock);

  expect(lockFingerprint, "la semántica del lock no debe cambiar al sincronizar la versión").toBe(EXPECTED_LOCK_SEMANTIC_FINGERPRINT);
  expect(packageLock.version, "package-lock.json debe coincidir con package.json").toBe(packageJson.version);
  expect(packageLock.packages?.[""]?.version, "el paquete raíz del lock debe coincidir con package.json").toBe(packageJson.version);
  expect(APP_VERSION).toBe(packageJson.version);
  expect(TARGET_VERSION).toBe(packageJson.version);
  expect(build.version).toBe(packageJson.version);
  expect(build.targetVersion).toBe(packageJson.version);
  expect(buildSource, "APP_VERSION debe derivar de package.json").toContain("packageJson.version");
  expect(buildSource, "build-info no debe duplicar un semver literal para APP_VERSION").not.toMatch(/APP_VERSION\s*=\s*["']\d+\.\d+\.\d+["']/);
  expect(buildSource, "TARGET_VERSION debe derivar de la versión canónica").not.toMatch(/TARGET_VERSION\s*=\s*["']\d+\.\d+\.\d+["']/);
  expect(layoutSource, "la metadata visible debe derivar de APP_VERSION").toContain("APP_VERSION");
  expect(layoutSource, "layout no debe fijar un número de versión literal").not.toMatch(/Financial App \d+\.\d+\.\d+/);
});
