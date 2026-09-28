import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`missing required file: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(value, minimum) {
  const current = parseVersion(value);
  const floor = parseVersion(minimum);
  if (!current || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > floor[index]) return true;
    if (current[index] < floor[index]) return false;
  }
  return true;
}

const pkg = JSON.parse(read("package.json") || "{}");
if (!versionAtLeast(pkg.version, "10.0.34")) {
  fail(`package version must be >= 10.0.34, received ${pkg.version ?? "missing"}`);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenExact = new Set([
  "ops/backend-alignment/workspace-context-rollout-bridge.ts.template",
]);
const forbiddenDirectories = [
  ".next/",
  "playwright-report/",
  "test-results/",
  "blob-report/",
  "coverage/",
];
const forbiddenSuffixes = [".bak", ".tmp", ".old", ".orig", ".rej", ".template"];
const forbiddenBasenames = new Set([".DS_Store"]);

for (const path of tracked) {
  if (forbiddenExact.has(path)) fail(`retired file is still tracked: ${path}`);
  if (forbiddenDirectories.some((prefix) => path.startsWith(prefix))) {
    fail(`generated artifact is tracked: ${path}`);
  }
  if (forbiddenSuffixes.some((suffix) => path.endsWith(suffix))) {
    fail(`temporary/retired file is tracked: ${path}`);
  }
  if (forbiddenBasenames.has(basename(path))) fail(`OS artifact is tracked: ${path}`);
}

const productFiles = tracked.filter((path) => {
  if (!(path.startsWith("app/") || path.startsWith("src/"))) return false;
  return [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname(path));
});

const debugPattern = /\bdebugger\s*;|\bconsole\.(?:log|debug|info|warn|error)\s*\(/;
for (const path of productFiles) {
  const text = read(path);
  if (debugPattern.test(text)) fail(`development debug statement found in product code: ${path}`);
}

const strictWorkspace = read("supabase/functions/financial-app-db-gateway/workspace-context.ts");
if (!strictWorkspace.includes('set role financial_app_gateway')) {
  fail("strict workspace isolation role is no longer enforced");
}
if (!strictWorkspace.includes("workspace_id")) {
  fail("strict workspace context no longer exposes workspace_id enforcement");
}

const pwaRuntime = read("app/pwa-runtime.tsx");
if (!pwaRuntime.includes('serviceWorker.register("/sw.js")')) {
  fail("PWA runtime no longer registers /sw.js");
}
for (const path of ["public/sw.js", "public/pwa-icon-192.svg", "public/pwa-icon-512.svg"]) {
  if (!existsSync(path)) fail(`required PWA resource removed: ${path}`);
}
const manifest = read("app/manifest.ts");
if (!manifest.includes("/pwa-icon-192.svg") || !manifest.includes("/pwa-icon-512.svg")) {
  fail("PWA manifest lost required icon references");
}
const layout = read("app/layout.tsx");
if (!layout.includes("PwaRuntimeProvider")) fail("root layout no longer mounts PwaRuntimeProvider");

const home = read("app/page.tsx");
if (!home.includes('./home-audit.module.css')) fail("home audit stylesheet is no longer referenced");
if (!existsSync("app/home-audit.module.css")) fail("home audit stylesheet was removed while still required");

const protectedBackupAssets = [
  "scripts/create-financial-backup.mjs",
  "scripts/validate-financial-backup.mjs",
  ".github/workflows/phase13-production-backup.yml",
  "scripts/create-financial-backup-v2.mjs",
  "scripts/validate-financial-backup-v2.mjs",
  ".github/workflows/backup-v2-restore-rehearsal.yml",
];
for (const path of protectedBackupAssets) {
  if (!existsSync(path)) fail(`backup asset removed before Task 30 replacement is certified: ${path}`);
}

if (failures.length > 0) {
  console.error("final_cleanup_contract_failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "ok",
  contract: "final-cleanup-10.0.34",
  version: pkg.version,
  trackedFilesChecked: tracked.length,
  productFilesChecked: productFiles.length,
  retiredTemplates: 0,
  pwaProtected: true,
  backupsProtectedUntilTask30: true,
}));
