import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
function read(path) {
  if (!existsSync(path)) { fail(`missing required file: ${path}`); return ""; }
  return readFileSync(path, "utf8");
}

const pkg = JSON.parse(read("package.json") || "{}");
const lock = JSON.parse(read("package-lock.json") || "{}");
if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version ?? ""))) fail(`package version is not SemVer: ${pkg.version ?? "missing"}`);
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) fail("package-lock version is not synchronized with package.json");

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenExact = new Set(["ops/backend-alignment/workspace-context-rollout-bridge.ts.template"]);
const forbiddenDirectories = [".next/", "playwright-report/", "test-results/", "blob-report/", "coverage/"];
const forbiddenSuffixes = [".bak", ".tmp", ".old", ".orig", ".rej", ".template"];
const forbiddenBasenames = new Set([".DS_Store"]);
for (const path of tracked) {
  if (forbiddenExact.has(path)) fail(`retired file is still tracked: ${path}`);
  if (forbiddenDirectories.some((prefix) => path.startsWith(prefix))) fail(`generated artifact is tracked: ${path}`);
  if (forbiddenSuffixes.some((suffix) => path.endsWith(suffix))) fail(`temporary/retired file is tracked: ${path}`);
  if (forbiddenBasenames.has(basename(path))) fail(`OS artifact is tracked: ${path}`);
}

const productFiles = tracked.filter((path) => (path.startsWith("app/") || path.startsWith("src/")) && [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname(path)));
const debugPattern = /\bdebugger\s*;|\bconsole\.(?:log|debug)\s*\(/;
for (const path of productFiles) if (debugPattern.test(read(path))) fail(`development debug statement found in product code: ${path}`);

const strictWorkspace = read("supabase/functions/financial-app-db-gateway/workspace-context.ts");
if (!strictWorkspace.includes('set role financial_app_gateway')) fail("strict workspace isolation role is no longer enforced");
if (!strictWorkspace.includes("workspace_id")) fail("strict workspace context no longer exposes workspace_id enforcement");

const pwaRuntime = read("app/pwa-runtime.tsx");
if (!pwaRuntime.includes('navigator.serviceWorker.register("/sw.js"')) fail("PWA runtime no longer registers /sw.js");
for (const path of ["public/sw.js", "public/pwa-icon-192.svg", "public/pwa-icon-512.svg"]) if (!existsSync(path)) fail(`required PWA resource removed: ${path}`);
const manifest = read("app/manifest.ts");
if (!manifest.includes("/pwa-icon-192.svg") || !manifest.includes("/pwa-icon-512.svg")) fail("PWA manifest lost required icon references");
const layout = read("app/layout.tsx");
if (!layout.includes("PwaRuntimeProvider")) fail("root layout no longer mounts PwaRuntimeProvider");

const home = read("app/page.tsx");
if (!home.includes('./home-audit.module.css')) fail("home audit stylesheet is no longer referenced");
if (!existsSync("app/home-audit.module.css")) fail("home audit stylesheet was removed while still required");

for (const path of ["scripts/create-financial-backup.mjs","scripts/validate-financial-backup.mjs",".github/workflows/phase13-production-backup.yml","scripts/create-financial-backup-v2.mjs","scripts/validate-financial-backup-v2.mjs",".github/workflows/backup-v2-restore-rehearsal.yml"]) {
  if (!existsSync(path)) fail(`protected backup asset removed: ${path}`);
}

if (failures.length) {
  console.error("final_cleanup_contract_failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", contract: "final-cleanup", version: pkg.version, trackedFilesChecked: tracked.length, productFilesChecked: productFiles.length, pwaProtected: true, workspaceIsolationProtected: true, backupsProtected: true }));
