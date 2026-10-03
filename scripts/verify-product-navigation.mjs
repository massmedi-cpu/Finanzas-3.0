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

function collectTsx(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsx(full));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

const canonicalProductNavigation = new Set([
  "app/app-shell.tsx",
  "app/mobile-navigation.tsx",
]);
const tsxFiles = collectTsx(path.join(root, "app"));
const pages = tsxFiles.filter((file) => path.basename(file) === "page.tsx");

for (const absolute of tsxFiles) {
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  const source = fs.readFileSync(absolute, "utf8");

  if (!canonicalProductNavigation.has(relative) && /\bnavigationItems\b/.test(source)) {
    fail(`${relative} intenta consumir navigationItems fuera de la infraestructura global`);
  }
  if (!canonicalProductNavigation.has(relative) && /aria-label=["'](?:Navegación principal|Navegación móvil|Más secciones)["']/.test(source)) {
    fail(`${relative} intenta recrear una superficie reservada a la navegación global`);
  }
}

for (const absolute of pages) {
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  const source = fs.readFileSync(absolute, "utf8");
  if (/from\s+["'][^"']*(?:app-shell|mobile-navigation)["']/.test(source)) {
    fail(`${relative} monta infraestructura de navegación global de forma local`);
  }
  if (/Volver\s+a\s+Inicio/i.test(source)) {
    fail(`${relative} reintroduce «Volver a Inicio» como sustituto del AppShell`);
  }
}

const inicioSources = [read("app/page.tsx"), read("app/inicio-overview.tsx")].join("\n");
if (/quickNav|aria-label=["'][^"']*(?:navegación|secciones)[^"']*["']/i.test(inicioSources)) {
  fail("Inicio reintroduce una barra de navegación local que compite con AppShell");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("✅ ART-009 product navigation guard: OK");
console.log(`- ${pages.length} page.tsx sin infraestructura global duplicada`);
console.log("- navegación contextual de módulos permitida; navegación de producto reservada a AppShell");
console.log("- desktop y móvil derivan de navigationItems y exponen ruta activa");
console.log("- destinos financieros principales presentes en la navegación persistente");
