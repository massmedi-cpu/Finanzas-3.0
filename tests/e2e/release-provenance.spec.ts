import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

test("PRE-004 · el release comercial tiene una procedencia inmutable verificable", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la procedencia del release se valida una vez por run");

  const root = process.cwd();
  const manifestPath = join(root, "release-manifest.json");
  expect(existsSync(manifestPath), "PRE-004 exige un release-manifest.json canónico").toBe(true);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    schemaVersion?: number;
    version?: string;
    tag?: string;
    commit?: string;
    artifact?: { algorithm?: string; digest?: string };
  };
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  const buildSource = readFileSync(join(root, "src/core/build-info.ts"), "utf8");

  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.version).toBe(packageJson.version);
  expect(manifest.tag).toBe(`v${packageJson.version}`);
  expect(manifest.commit).toMatch(SHA);
  expect(manifest.artifact?.algorithm).toBe("sha256");
  expect(manifest.artifact?.digest).toMatch(SHA256);

  expect(buildSource, "/api/build debe exponer la misma identidad inmutable del manifest").toContain("releaseId");
  expect(buildSource).toContain("artifactDigest");
  expect(buildSource).toContain("releaseTag");
});
