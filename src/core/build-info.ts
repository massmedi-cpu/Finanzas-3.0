import packageJson from "../../package.json";

// Release identity has one canonical source: package.json.
export const APP_VERSION = packageJson.version;
export const TARGET_VERSION = APP_VERSION;
export const CURRENT_PHASE = 13 as const;
export const CURRENT_PHASE_NAME = "Consolidación, hardening precomercial y producción 10.0.1" as const;
export const CURRENT_PHASE_BLOCK = 1 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Integración, regresión, limpieza, respaldo, restauración y publicación" as const;

function assertReleaseIdentity() {
  if (APP_VERSION !== TARGET_VERSION) {
    throw new Error("release_version_mismatch");
  }
}

export function getBuildInfo() {
  assertReleaseIdentity();

  return {
    version: APP_VERSION,
    targetVersion: TARGET_VERSION,
    phase: CURRENT_PHASE,
    phaseName: CURRENT_PHASE_NAME,
    phaseBlock: CURRENT_PHASE_BLOCK,
    phaseBlockName: CURRENT_PHASE_BLOCK_NAME,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_ENV ?? "local",
  } as const;
}
