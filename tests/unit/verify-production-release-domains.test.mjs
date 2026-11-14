import assert from "node:assert/strict";
import test from "node:test";
import { verifyProductionReleaseDomains, PRODUCTION_ORIGINS } from "../../scripts/verify-production-release-domains.mjs";

const SHA = "a".repeat(40);
const PROFILE = { documents: true, documentOcr: true, documentDriveSync: true };
const MANIFEST = {
  version: "10.0.105", commit: SHA, deploymentId: "dpl_TestRelease123",
  environment: "production", releaseFeatures: PROFILE,
};
const BUILD = { ...MANIFEST, targetVersion: MANIFEST.version };

function makeFetch(change = (_, build) => build, headers = { "cache-control": "private, no-store" }) {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url, options });
    const build = change(url, structuredClone(BUILD));
    return { status: 200, redirected: false, url, headers: new Headers(headers), json: async () => build };
  };
  return { seen, fetcher };
}

test("REC-REL-708 · public release verifies BOTH canonical domains without writes or redirects", async () => {
  const { seen, fetcher } = makeFetch();
  assert.deepEqual(await verifyProductionReleaseDomains(MANIFEST, fetcher), { status: "ok", verifiedDomains: 2 });
  assert.deepEqual(seen.map((entry) => entry.url), PRODUCTION_ORIGINS.map((x) => x + "/api/build"));
  assert.ok(seen.every(({ options }) => options.method === "GET" && options.redirect === "manual"));
});

test("REC-REL-709 · historic/deferred version and incomplete profile cannot be officially published", async () => {
  for (const version of ["10.0.103", "10.0.104"]) {
    await assert.rejects(verifyProductionReleaseDomains({ ...MANIFEST, version }, makeFetch().fetcher), /requires_full_documents/);
  }
  await assert.rejects(verifyProductionReleaseDomains({ ...MANIFEST, releaseFeatures: { ...PROFILE, documentOcr: false } }, makeFetch().fetcher), /manifest_profile_incomplete/);
});

test("REC-REL-710 · a version, SHA, deployment or feature mismatch on EITHER alias is blocked", async () => {
  for (const key of ["version", "targetVersion", "commit", "deploymentId", "environment"]) {
    for (const index of [0, 1]) {
      const { fetcher } = makeFetch((url, build) => url.startsWith(PRODUCTION_ORIGINS[index]) ? { ...build, [key]: "invalid" } : build);
      await assert.rejects(verifyProductionReleaseDomains(MANIFEST, fetcher), /identity_mismatch/);
    }
  }
  for (const index of [0, 1]) {
    const { fetcher } = makeFetch((url, build) => url.startsWith(PRODUCTION_ORIGINS[index]) ?
      { ...build, releaseFeatures: { ...PROFILE, documentDriveSync: false } } : build);
    await assert.rejects(verifyProductionReleaseDomains(MANIFEST, fetcher), /feature_incomplete/);
  }
});

test("REC-REL-711 · absent no-store blocks an otherwise correct deployment", async () => {
  const { fetcher } = makeFetch((_, build) => build, { "cache-control": "public, max-age=600" });
  await assert.rejects(verifyProductionReleaseDomains(MANIFEST, fetcher), /identity_cached/);
});

test("REC-REL-712 · redirect or inaccessible origin fails without consulting other data", async () => {
  const r = makeFetch();
  const redirect = async (url, opts) => ({ ...(await r.fetcher(url, opts)), status: 307 });
  await assert.rejects(verifyProductionReleaseDomains(MANIFEST, redirect), /domain_not_ready/);
});
