import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "app");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`❌ ART-006 shared AppShell: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`✅ ${message}`);

const layout = read("app/layout.tsx");
const shell = read("app/app-shell.tsx");

if (!layout.includes('import AppShell from "./app-shell"')) {
  fail("app/layout.tsx debe importar el AppShell compartido");
}
if (!layout.includes("<AppShell>{children}</AppShell>")) {
  fail("RootLayout debe envolver children con AppShell");
}
if (!layout.includes("<PwaRuntimeProvider>") || layout.indexOf("<PwaRuntimeProvider>") > layout.indexOf("<AppShell>{children}</AppShell>")) {
  fail("AppShell debe permanecer dentro de PwaRuntimeProvider");
}

for (const token of [
  "AppShellBoundaryContext",
  "alreadyInsideSharedShell",
  'data-app-shell="shared"',
  "<GlobalSearch />",
  "<MobileNavigation />",
  "<SourceTrustStatus pathname={pathname} />",
  'id="main-content"',
]) {
  if (!shell.includes(token)) fail(`app/app-shell.tsx debe conservar «${token}»`);
}

function collectPages(dir) {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") continue;
      pages.push(...collectPages(absolute));
      continue;
    }
    if (entry.name === "page.tsx") pages.push(absolute);
  }
  return pages;
}

const pageFiles = collectPages(appRoot);
const localShellPages = [];
for (const absolute of pageFiles) {
  const source = fs.readFileSync(absolute, "utf8");
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  if (/import\s+AppShell\s+from\s+["'][^"']*app-shell["']/.test(source) || /<AppShell(?:\s|>)/.test(source)) {
    localShellPages.push(relative);
  }
}

if (localShellPages.length) {
  fail(`las páginas no deben montar AppShell localmente: ${localShellPages.join(", ")}`);
}

if (!fs.existsSync(path.join(root, "docs/precommercial-audit/07g-shared-app-shell-10.0.59.md"))) {
  fail("falta la documentación ART-006 de 10.0.59");
}

if (!process.exitCode) {
  pass("RootLayout gobierna el AppShell para todas las páginas");
  pass("AppShell es idempotente durante la migración y conserva navegación global");
  pass(`${pageFiles.length} page.tsx comprobados sin wrappers AppShell locales`);
  pass("ART-006 protegido contra regresiones de shell por página");
}
