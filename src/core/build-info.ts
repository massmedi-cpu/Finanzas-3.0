import packageJson from "../../package.json";
import { getReleaseProvenance } from "./release-provenance";

// Release identity has one canonical source: package.json.
export const APP_VERSION = packageJson.version;
export const TARGET_VERSION = APP_VERSION;
export const CURRENT_PHASE = 13 as const;
export const CURRENT_PHASE_NAME = "Consolidación, coherencia financiera y experiencia premium 10.0.6" as const;
export const CURRENT_PHASE_BLOCK = 1 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Trazabilidad bancaria, aislamiento y experiencia premium" as const;

function assertReleaseIdentity() {
  if (APP_VERSION !== TARGET_VERSION) {
    throw new Error("release_version_mismatch");
  }
}

export function getBuildInfo() {
  assertReleaseIdentity();

  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;
  const environment = process.env.VERCEL_ENV ?? "local";

  return {
    version: APP_VERSION,
    targetVersion: TARGET_VERSION,
    phase: CURRENT_PHASE,
    phaseName: CURRENT_PHASE_NAME,
    phaseBlock: CURRENT_PHASE_BLOCK,
    phaseBlockName: CURRENT_PHASE_BLOCK_NAME,
    commit,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    deploymentId,
    environment,
    ...getReleaseProvenance({ commit, deploymentId, environment }),
  } as const;
}
