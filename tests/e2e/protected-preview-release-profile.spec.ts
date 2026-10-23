import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type Features = { documents: boolean; documentOcr: boolean; documentDriveSync: boolean };
const enabled: Features = { documents: true, documentOcr: true, documentDriveSync: true };
const deferred: Features = { documents: false, documentOcr: false, documentDriveSync: false };
const sha = "a".repeat(40);

/** Execute the ACTUAL inline HTTP gate, without credentials, network or a deployment. */
async function runGate(features: unknown, alter?: (path: string, reply: {
  status: number; body: Record<string, unknown>; cache: string;
}) => void) {
  const workflow = readFileSync(".github/workflows/protected-preview-readonly-source.yml", "utf8");
  const inline = workflow.match(/node <<'NODE'\n([\s\S]*?)\n          NODE/);
  if (!inline) throw new Error("preview_gate_script_missing");
  const processStub = { env: {
    PREVIEW_URL: "https://synthetic-preview.vercel.app", EXPECTED_SHA: sha,
    VERCEL_TRUSTED_OIDC_TOKEN: "SYNTHETIC_TOKEN_DO_NOT_LOG",
    VERCEL_AUTOMATION_BYPASS_SECRET: "",
  }, exitCode: 0 };
  const requests: Array<{ url: string; options: RequestInit }> = [];
  const messages: string[] = [];
  await runInNewContext(inline[1].replace(/^          /gm, ""), {
    process: processStub, AbortSignal,
    console: { log: (text: string) => messages.push(text), error: (text: string) => messages.push(text) },
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      const path = new URL(url).pathname;
      const profile = features as Features;
      const reply = { status: 401, body: { error: "authentication_required" } as Record<string, unknown>, cache: "no-store" };
      if (path === "/api/build") {
        reply.status = 200;
        reply.body = { commit: sha, environment: "preview", releaseFeatures: features };
      } else if (path.startsWith("/api/documents") && path !== "/api/documents/ocr-review") {
        const cut = !profile?.documents || (path === "/api/documents/ocr" && !profile.documentOcr);
        reply.status = cut ? 404 : 403;
        reply.body = cut ? { error: "feature_deferred", code: null } : { code: "workspace_context_required" };
      }
      alter?.(path, reply);
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "cache-control": reply.cache } });
    },
  });
  expect(messages.join("\n")).not.toContain(processStub.env.VERCEL_TRUSTED_OIDC_TOKEN);
  for (const { url, options } of requests) {
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("manual");
    expect(url).not.toContain("SYNTHETIC_TOKEN");
  }
  return { exitCode: processStub.exitCode, requests, messages };
}

test("REC-REL-395 · exact preview HTTP gate accepts enabled, OCR-only cut and full document cut", async () => {
  for (const profile of [enabled, { ...enabled, documentOcr: false, documentDriveSync: false }, deferred]) {
    const result = await runGate(profile);
    expect(result.exitCode).toBe(0);
    expect(result.requests).toHaveLength(9);
    expect(result.messages.filter(message => message.startsWith("DOCUMENT_BOUNDARY|anonymous_get_denied"))).toHaveLength(4);
  }
});

test("REC-REL-396 · missing, non-boolean, contradictory profile or wrong SHA cannot certify a preview", async () => {
  for (const profile of [undefined, null, {}, { ...enabled, documents: "false" },
    { ...deferred, documentOcr: true }, { ...deferred, documentDriveSync: true }]) {
    expect((await runGate(profile)).exitCode).toBe(1);
  }
  expect((await runGate(deferred, (path, reply) => {
    if (path === "/api/build") reply.body.commit = "b".repeat(40);
  })).exitCode).toBe(1);
});

test("REC-REL-397 · full cut requires 404, enabled surface requires workspace denial, OCR history always requires login", async () => {
  for (const profile of [enabled, deferred]) {
    for (const target of ["/api/documents", "/api/documents/download", "/api/documents/ocr", "/api/documents/ocr-review"]) {
      expect((await runGate(profile, (path, reply) => {
        if (path === target) { reply.status = 200; reply.body = { documents: ["PRIVATE_SENTINEL"] }; }
      })).exitCode).toBe(1);
    }
  }
  expect((await runGate(deferred, (path, reply) => {
    if (path === "/api/documents") { reply.status = 403; reply.body = { code: "workspace_context_required" }; }
  })).exitCode).toBe(1);
  expect((await runGate(enabled, (path, reply) => {
    if (path === "/api/documents") { reply.status = 404; reply.body = { error: "feature_deferred", code: null }; }
  })).exitCode).toBe(1);
  expect((await runGate(deferred, (path, reply) => {
    if (path === "/api/documents/ocr-review") { reply.status = 404; reply.body = { error: "feature_deferred", code: null }; }
  })).exitCode).toBe(1);
});

test("REC-REL-398 · source auth, no-store and metadata non-disclosure remain mandatory under deferral", async () => {
  for (const target of ["/api/source/google/status", "/api/source/google/sync", "/api/health/source-runtime", "/api/source/google/connect"]) {
    const result = await runGate(deferred, (path, reply) => {
      if (path === target) { reply.status = 200; reply.body = { configured: true, accountEmail: "PRIVATE_SENTINEL" }; }
    });
    expect(result.exitCode).toBe(1);
    expect(result.messages.join("\n")).not.toContain("PRIVATE_SENTINEL");
  }
  for (const target of ["/api/documents", "/api/documents/ocr-review", "/api/source/google/status"]) {
    expect((await runGate(deferred, (path, reply) => {
      if (path === target) reply.cache = "public, max-age=3600";
    })).exitCode).toBe(1);
  }
  expect((await runGate(deferred, (path, reply) => {
    if (path === "/api/documents") reply.body.documents = ["PRIVATE_SENTINEL"];
  })).exitCode).toBe(1);
});
