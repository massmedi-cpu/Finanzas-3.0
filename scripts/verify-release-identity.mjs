import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const buildInfoSource = readFileSync(new URL("../src/core/build-info.ts", import.meta.url), "utf8");

const version = String(packageJson.version ?? "");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("release_identity_invalid_package_version");
if (packageLock.version !== version || packageLock.packages?.[""]?.version !== version) {
  throw new Error("release_identity_lockfile_version_mismatch");
}
if (!buildInfoSource.includes("export const APP_VERSION = packageJson.version;")) {
  throw new Error("release_identity_package_json_not_canonical");
}
if (!buildInfoSource.includes("export const TARGET_VERSION = APP_VERSION;")) {
  throw new Error("release_identity_target_not_canonical");
}
const phaseNameMatch = buildInfoSource.match(/CURRENT_PHASE_NAME\s*=\s*"([^"]+)"/);
if (!phaseNameMatch) throw new Error("release_identity_phase_name_missing");
const phaseName = phaseNameMatch[1];
if (/\b\d+\.\d+\.\d+\b/.test(phaseName)) throw new Error("release_identity_phase_name_contains_version");

console.log(JSON.stringify({ status: "release_identity_ok", version, phaseName }));
