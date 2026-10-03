import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const appShell = read("app/app-shell.tsx");
const mobileNavigation = read("app/mobile-navigation.tsx");
const navigationItems = read("app/navigation-items.ts");

function fail(message) {
  console.error(`❌ ART-009 navigation guard: ${message}`);
  process.exitCode = 1;
}

if (!/navigationItems\.map\(/.test(appShell) || !/aria-label="Navegación principal"/.test(appShell)) {
  fail("AppShell debe renderizar la navegación principal desde navigationItems");
}
if (!/<MobileNavigation\s*\/>/.test(appShell)) {
  fail("AppShell debe ser la autoridad que monta MobileNavigation");
}
if (!/navigationItems\.filter\(/.test(mobileNavigation) || !/aria-label="Navegación móvil"/.test(mobileNavigation)) {
  fail("MobileNavigation debe derivar su dock desde navigationItems");
}
if (!/aria-label="Más secciones"/.test(mobileNavigation)) {
  fail("la navegación móvil debe mantener un único panel de secciones secundarias");
}
if (!/aria-current=\{active \? "page" : undefined\}/.test(mobileNavigation)) {
  fail("la navegación móvil debe exponer el destino activo semánticamente");
}
if (!/aria-current=\{active && !pendingHref \? "page" : undefined\}/.test(appShell)) {
  fail("la navegación desktop debe exponer el destino activo semánticamente");
}

const requiredDestinations = [
  "/",
  "/cash-flow",
  "/transactions",
  "/analysis",
  "/compare",
  "/accounts",
  "/net-worth",
  "/budgets",
  "/recurrences",
  "/forecast",
  "/documents",
  "/configuration",
];
for (const href of requiredDestinations) {
  if (!navigationItems.includes(`href: "${href}"`)) fail(`falta el destino global ${href}`);
}

function collectPages(dir) {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pages.push(...collectPages(full));
    else if (entry.isFile() && entry.name === "page.tsx") pages.push(full);
  }
  return pages;
}

const pages = collectPages(path.join(root, "app"));
for (const absolute of pages) {
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  const source = fs.readFileSync(absolute, "utf8");
  if (/<nav\b/i.test(source)) {
    fail(`${relative} declara <nav>; la navegación de producto pertenece al AppShell`);
  }
  if (/quickNav|Volver\s+a\s+Inicio/i.test(source)) {
    fail(`${relative} reintroduce el patrón histórico de navegación local de ART-009`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("✅ ART-009 product navigation guard: OK");
console.log(`- ${pages.length} page.tsx sin barras de navegación locales`);
console.log("- desktop y móvil derivan de navigationItems y exponen ruta activa");
console.log("- destinos financieros principales presentes en la navegación persistente");
