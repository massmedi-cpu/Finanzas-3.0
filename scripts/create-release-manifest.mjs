#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const VERCEL_DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;

function fail(message) {
  throw new Error(`release_manifest_invalid:${message}`);
}

function readArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("invalid_arguments");
    args.set(key.slice(2), value);
  }
  return args;
}

const args = readArgs(process.argv.slice(2));
const buildInfoPath = args.get("build-info");
const outputPath = args.get("output");
const expectedSha = args.get("expected-sha");
const expectedTag = args.get("tag");
const expectedEnvironment = args.get("expected-environment");
const verifiedAt = args.get("verified-at") ?? new Date().toISOString();

if (!buildInfoPath || !outputPath || !expectedSha || !expectedTag) fail("missing_required_argument");
if (!SHA.test(expectedSha)) fail("expected_sha");

const build = JSON.parse(readFileSync(resolve(buildInfoPath), "utf8"));

if (build.releaseSchemaVersion !== 1) fail("schema_version");
if (typeof build.version !== "string" || !build.version) fail("version");
if (build.targetVersion !== build.version) fail("target_version");
if (build.releaseTag !== expectedTag || expectedTag !== `v${build.version}`) fail("tag_mismatch");
if (build.commit !== expectedSha) fail("commit_mismatch");
if (!SHA.test(build.commit)) fail("commit_format");
if (typeof build.deploymentId !== "string" || !VERCEL_DEPLOYMENT_ID.test(build.deploymentId)) fail("deployment_id");
if (!new Set(["preview", "production"]).has(build.environment)) fail("environment");
if (expectedEnvironment && build.environment !== expectedEnvironment) fail("environment_mismatch");
if (build.releaseDeployable !== true) fail("not_deployable");
if (build.artifactAlgorithm !== "sha256") fail("artifact_algorithm");
if (build.artifactScope !== "deployment-provenance-v1") fail("artifact_scope");
if (typeof build.artifactDigest !== "string" || !SHA256.test(build.artifactDigest)) fail("artifact_digest");

const expectedReleaseId = `financial-app@${build.version}+${build.artifactDigest.slice(0, 16)}`;
if (build.releaseId !== expectedReleaseId) fail("release_id");

const manifest = {
  schemaVersion: 1,
  app: "financial-app",
  version: build.version,
  tag: build.releaseTag,
  commit: build.commit,
  deploymentId: build.deploymentId,
  environment: build.environment,
  releaseId: build.releaseId,
  artifact: {
    algorithm: build.artifactAlgorithm,
    scope: build.artifactScope,
    digest: build.artifactDigest,
  },
  verifiedAt,
};

writeFileSync(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`RELEASE_MANIFEST_OK|${manifest.releaseId}|${manifest.commit}|${manifest.deploymentId}\n`);
