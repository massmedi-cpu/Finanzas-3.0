#!/usr/bin/env node
/**
 * REC-REL-708: fail closed before creating a GitHub release if the TWO
 * official public aliases disagree, redirect, cache release identity,
 * or serve a different immutable deployment. No POST or mutation occurs.
 * A restricted 10.0.104 must never be published as the full release.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedProductionDocumentProfile } from "../src/domain/release-production-profile.ts";

export const PRODUCTION_ORIGINS = Object.freeze([
  "https://finanzas-3-0.vercel.app",
  "https://financialapp-home.vercel.app",
]);

function requireIdentity(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("production_release_manifest_missing");
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
    throw new Error("production_release_version_invalid");
  }
  const required = expectedProductionDocumentProfile(manifest.version);
  if (!required || !Object.values(required).every((active) => active === true)) {
    throw new Error("production_release_requires_full_documents_ocr_drive_version_10_0_105_or_newer");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.commit ?? "")) {
    throw new Error("production_release_commit_invalid");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(manifest.deploymentId ?? "")) {
    throw new Error("production_release_deployment_invalid");
  }
  if (manifest.environment !== "production") {
    throw new Error("production_release_environment_invalid");
  }
  for (const [key, value] of Object.entries(required)) {
    if (manifest.releaseFeatures?.[key] !== value) {
      throw new Error("production_release_manifest_profile_incomplete:" + key);
    }
  }
  return required;
}

export async function verifyProductionReleaseDomains(manifest, fetchImpl = fetch) {
  const required = requireIdentity(manifest);
  for (const origin of PRODUCTION_ORIGINS) {
    const url = origin + "/api/build";
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "application/json" },
    });
    if (response.status !== 200 || response.redirected) {
      throw new Error("production_release_domain_not_ready:" + origin);
    }
    if (response.url && response.url !== url) {
      throw new Error("production_release_domain_redirected:" + origin);
    }
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (!/(?:^|,)\s*no-store(?:\s*,|\s*$)/i.test(cacheControl)) {
      throw new Error("production_release_identity_cached:" + origin);
    }
    const build = await response.json();
    if (!build || typeof build !== "object" ||
      build.version !== manifest.version ||
      build.targetVersion !== manifest.version ||
      build.commit !== manifest.commit ||
      build.deploymentId !== manifest.deploymentId ||
      build.environment !== "production") {
      throw new Error("production_release_domain_identity_mismatch:" + origin);
    }
    for (const [key, value] of Object.entries(required)) {
      if (build.releaseFeatures?.[key] !== value) {
        throw new Error("production_release_domain_feature_incomplete:" + origin + ":" + key);
      }
    }
  }
  return { status: "ok", verifiedDomains: PRODUCTION_ORIGINS.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    throw new Error("usage: verify-production-release-domains.mjs <release-manifest.json>");
  }
  const manifest = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8"));
  const result = await verifyProductionReleaseDomains(manifest);
  process.stdout.write("PRODUCTION_RELEASE_ALIASES_OK|" + result.verifiedDomains + "\n");
}
