import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<string, unknown>;
}

test("la versión candidata tiene una única identidad coherente", () => {
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json") as Record<string, unknown> & {
    packages?: Record<string, { version?: string }>;
  };
  const buildInfo = readFileSync(resolve(process.cwd(), "src/core/build-info.ts"), "utf8");

  expect(packageJson.version).toBe("10.0.4");
  expect(packageLock.version).toBe(packageJson.version);
  expect(packageLock.packages?.[""]?.version).toBe(packageJson.version);
  expect(buildInfo).toContain('export const APP_VERSION = packageJson.version');
  expect(buildInfo).toContain('experiencia premium 10.0.4');
  expect(buildInfo).not.toContain('producción 10.0.3');
});
