import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPOSITORY = "massmedi-cpu/Finanzas-3.0";
const PRODUCTION_URL = "https://financialapp-home.vercel.app/";
const VERSION = "10.0.103";
const DEPLOYMENT_COMMIT = "6dad59c6c2db3575618a7c91c49c3060a93bbba1";
const DEPLOYMENT_ID = "dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5";
const WORKFLOW = "production-postflight.yml";

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: "utf8", shell: false, ...options });
  if (result.status !== 0) throw new Error(`${program}_failed:${result.status}:${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function github(endpoint) {
  return JSON.parse(command("gh", ["api", `repos/${REPOSITORY}/${endpoint}`]));
}

async function verifyBuild() {
  const response = await fetch(new URL("api/build", PRODUCTION_URL), { cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(`production_build_http_${response.status}`);
  const build = await response.json();
  if (build.version !== VERSION || build.targetVersion !== VERSION || build.environment !== "production" ||
      build.branch !== "main" || build.commit !== DEPLOYMENT_COMMIT || build.deploymentId !== DEPLOYMENT_ID ||
      build.releaseDeployable !== true) throw new Error("production_identity_changed");
  return build;
}

if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== "refs/heads/main" ||
    !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? "")) throw new Error("unexpected_release_context");
const toolingCommit = process.env.GITHUB_SHA;
command("git", ["merge-base", "--is-ancestor", DEPLOYMENT_COMMIT, toolingCommit]);
const deployedPackage = JSON.parse(command("git", ["show", `${DEPLOYMENT_COMMIT}:package.json`]));
if (deployedPackage.version !== VERSION) throw new Error("deployed_package_version_mismatch");

await verifyBuild();
const startedAt = Date.now() - 2000;
writeFileSync("release-postflight-dispatch.json", JSON.stringify({
  ref: "main",
  inputs: {
    production_url: PRODUCTION_URL,
    expected_version: VERSION,
    deployment_commit: DEPLOYMENT_COMMIT,
    deployment_id: DEPLOYMENT_ID,
  },
}));
command("gh", ["api", "--method", "POST", `repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`,
  "--input", "release-postflight-dispatch.json"]);

const deadline = Date.now() + 25 * 60 * 1000;
let postflight = null;
while (Date.now() < deadline) {
  const result = github(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=20`);
  const matches = result.workflow_runs.filter(run => run.head_sha === toolingCommit && Date.parse(run.created_at) >= startedAt);
  if (matches.length > 1) throw new Error("ambiguous_postflight_run");
  if (matches.length === 1) {
    postflight = matches[0];
    if (postflight.status === "completed") break;
  }
  await new Promise(resolve => setTimeout(resolve, 15000));
}
if (!postflight || postflight.status !== "completed" || postflight.conclusion !== "success") {
  throw new Error(`production_postflight_not_success:${postflight?.id ?? "missing"}:${postflight?.conclusion ?? "timeout"}`);
}
console.log(`PRODUCTION_POSTFLIGHT_OK|run=${postflight.id}|commit=${DEPLOYMENT_COMMIT}|deployment=${DEPLOYMENT_ID}`);

const build = await verifyBuild();
writeFileSync("release-build.production.json", `${JSON.stringify(build, null, 2)}\n`);
command(process.execPath, ["scripts/create-release-manifest.mjs", "--build-info", "release-build.production.json",
  "--output", "release-manifest.production.json", "--expected-sha", DEPLOYMENT_COMMIT,
  "--tag", `v${VERSION}`, "--expected-environment", "production"]);
const existingTag = spawnSync("gh", ["api", `repos/${REPOSITORY}/git/ref/tags/v${VERSION}`], { encoding: "utf8", shell: false });
if (existingTag.status === 0) throw new Error("release_tag_already_exists_refusing_to_replace");
if (!existingTag.stderr.includes("HTTP 404")) throw new Error("cannot_verify_release_tag_absence");

command("gh", ["release", "create", `v${VERSION}`, "release-manifest.production.json#release-manifest.json",
  "--repo", REPOSITORY, "--target", DEPLOYMENT_COMMIT, "--title", `Financial App ${VERSION}`,
  "--notes", `Correcciones de auditoría E2E validadas y publicadas. Candidata: 58/58 workflows y 14/14 recorridos completos en backend aislado. Production Postflight: ${postflight.html_url}. El manifiesto adjunto vincula versión, commit, deployment y procedencia SHA-256.`]);
const tag = github(`git/ref/tags/v${VERSION}`);
if (tag.object.type !== "commit" || tag.object.sha !== DEPLOYMENT_COMMIT) throw new Error("published_tag_target_mismatch");
writeFileSync("release-postflight-result.json", `${JSON.stringify({
  version: VERSION, deploymentCommit: DEPLOYMENT_COMMIT, deploymentId: DEPLOYMENT_ID,
  toolingCommit, postflightRun: postflight.id, postflightUrl: postflight.html_url,
  conclusion: postflight.conclusion, releaseTag: `v${VERSION}`, bankSourcePolicy: "read_only",
}, null, 2)}\n`);
console.log(`PRODUCTION_RELEASE_OK|version=${VERSION}|tag=v${VERSION}|postflight=${postflight.id}`);
