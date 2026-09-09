import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { getBuildInfo } from "../../src/core/build-info";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const restoreEnvironment = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

test("PRE-004 · el release comercial tiene una procedencia inmutable verificable", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la procedencia del release se valida una vez por run");

  const previous = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    environment: process.env.VERCEL_ENV,
  };
  const commit = "a".repeat(40);
  const deploymentId = "dpl_PRE004ImmutableArtifact";
  const directory = mkdtempSync(join(tmpdir(), "financial-release-"));

  try {
    process.env.VERCEL_GIT_COMMIT_SHA = commit;
    process.env.VERCEL_GIT_COMMIT_REF = "release/pre004-test";
    process.env.VERCEL_DEPLOYMENT_ID = deploymentId;
    process.env.VERCEL_ENV = "preview";

    const build = getBuildInfo();
    expect(build.commit).toMatch(SHA);
    expect(build.deploymentId).toBe(deploymentId);
    expect(build.environment).toBe("preview");
    expect(build.releaseDeployable).toBe(true);
    expect(build.releaseSchemaVersion).toBe(1);
    expect(build.releaseTag).toBe(`v${build.version}`);
    expect(build.releaseId).toBe(`financial-app@${build.version}+${build.artifactDigest.slice(0, 16)}`);
    expect(build.artifactAlgorithm).toBe("sha256");
    expect(build.artifactScope).toBe("deployment-provenance-v1");
    expect(build.artifactDigest).toMatch(SHA256);

    const buildPath = join(directory, "build-info.json");
    const manifestPath = join(directory, "release-manifest.json");
    writeFileSync(buildPath, `${JSON.stringify(build)}\n`, "utf8");

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts/create-release-manifest.mjs"),
        "--build-info",
        buildPath,
        "--output",
        manifestPath,
        "--expected-sha",
        commit,
        "--tag",
        build.releaseTag,
        "--expected-environment",
        "preview",
        "--verified-at",
        "2026-09-09T12:00:00.000Z",
      ],
      { stdio: "pipe" },
    );

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schemaVersion: number;
      version: string;
      tag: string;
      commit: string;
      deploymentId: string;
      environment: string;
      releaseId: string;
      artifact: { algorithm: string; scope: string; digest: string };
      verifiedAt: string;
    };

    expect(manifest).toEqual({
      schemaVersion: 1,
      app: "financial-app",
      version: build.version,
      tag: build.releaseTag,
      commit,
      deploymentId,
      environment: "preview",
      releaseId: build.releaseId,
      artifact: {
        algorithm: "sha256",
        scope: "deployment-provenance-v1",
        digest: build.artifactDigest,
      },
      verifiedAt: "2026-09-09T12:00:00.000Z",
    });

    expect(() =>
      execFileSync(
        process.execPath,
        [
          join(process.cwd(), "scripts/create-release-manifest.mjs"),
          "--build-info",
          buildPath,
          "--output",
          join(directory, "tampered.json"),
          "--expected-sha",
          "b".repeat(40),
          "--tag",
          build.releaseTag,
        ],
        { stdio: "pipe" },
      ),
    ).toThrow();
  } finally {
    restoreEnvironment("VERCEL_GIT_COMMIT_SHA", previous.commit);
    restoreEnvironment("VERCEL_GIT_COMMIT_REF", previous.branch);
    restoreEnvironment("VERCEL_DEPLOYMENT_ID", previous.deploymentId);
    restoreEnvironment("VERCEL_ENV", previous.environment);
    rmSync(directory, { recursive: true, force: true });
  }
});
