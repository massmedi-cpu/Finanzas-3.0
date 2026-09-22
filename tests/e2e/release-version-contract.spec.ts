import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("release version has one synchronized source of truth and is visible in build metadata", async () => {
  const root = process.cwd();
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const buildInfo = await readFile(path.join(root, "src/core/build-info.ts"), "utf8");
  const layout = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  const buildRoute = await readFile(path.join(root, "app/api/build/route.ts"), "utf8");

  expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(packageLock.version).toBe(packageJson.version);
  expect(packageLock.packages?.[""]?.version).toBe(packageJson.version);

  expect(buildInfo).toContain('import packageJson from "../../package.json"');
  expect(buildInfo).toContain("export const APP_VERSION = packageJson.version;");
  expect(buildInfo).toContain("export const TARGET_VERSION = APP_VERSION;");
  expect(buildInfo).not.toMatch(/CURRENT_PHASE_NAME\s*=\s*["'][^"']*\d+\.\d+\.\d+/);

  expect(layout).toContain('import { APP_VERSION } from "../src/core/build-info"');
  expect(layout).toContain("Financial App ${APP_VERSION}");
  expect(buildRoute).toContain("getBuildInfo()");
});
