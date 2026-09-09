import { createHash } from "node:crypto";
import packageJson from "../../package.json";

export const RELEASE_PROVENANCE_SCHEMA_VERSION = 1 as const;
export const RELEASE_ARTIFACT_ALGORITHM = "sha256" as const;
export const RELEASE_ARTIFACT_SCOPE = "deployment-provenance-v1" as const;

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const VERCEL_DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;
const DEPLOYABLE_ENVIRONMENTS = new Set(["preview", "production"]);

export type ReleaseProvenanceInput = {
  commit: string;
  deploymentId: string | null;
  environment: string;
};

function artifactPayload(input: ReleaseProvenanceInput) {
  return [
    "financial-app-release-artifact-v1",
    packageJson.name,
    packageJson.version,
    input.commit,
    input.deploymentId ?? "no-deployment",
    input.environment,
  ].join("\n");
}

export function getReleaseProvenance(input: ReleaseProvenanceInput) {
  const artifactDigest = createHash(RELEASE_ARTIFACT_ALGORITHM)
    .update(artifactPayload(input), "utf8")
    .digest("hex");

  return {
    releaseSchemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
    releaseTag: `v${packageJson.version}`,
    releaseId: `${packageJson.name}@${packageJson.version}+${artifactDigest.slice(0, 16)}`,
    artifactAlgorithm: RELEASE_ARTIFACT_ALGORITHM,
    artifactScope: RELEASE_ARTIFACT_SCOPE,
    artifactDigest,
    releaseDeployable:
      COMMIT_SHA.test(input.commit) &&
      typeof input.deploymentId === "string" &&
      VERCEL_DEPLOYMENT_ID.test(input.deploymentId) &&
      DEPLOYABLE_ENVIRONMENTS.has(input.environment),
  } as const;
}
