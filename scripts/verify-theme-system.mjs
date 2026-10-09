import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const preferences = read("app/visual-preferences.tsx");
const layout = read("app/layout.tsx");
const themeCss = read("app/theme-system.css");
const appearance = read("app/configuration/appearance/appearance-client.tsx");
const bootstrap = read("public/theme-init.js");

function fail(message) {
  console.error(`❌ ART-010 theme guard: ${message}`);
  process.exitCode = 1;
}

for (const value of ["system", "dark", "light"]) {
  if (!preferences.includes(`"${value}"`)) fail(`falta VisualTheme ${value}`);
  if (!appearance.includes(`value: "${value}"`)) fail(`Apariencia no expone ${value}`);
}

if (!preferences.includes("window.matchMedia(SYSTEM_THEME_QUERY)")) {
  fail("la preferencia system debe derivar del esquema del sistema operativo");
}
if (!preferences.includes('media.addEventListener("change"')) {
  fail("system debe reaccionar en vivo a cambios de prefers-color-scheme");
}
if (!preferences.includes("root.dataset.themePreference") || !preferences.includes("root.dataset.theme = resolvedTheme")) {
  fail("el runtime debe publicar tema preferido y tema resuelto en <html>");
}
if (!preferences.includes("root.style.colorScheme = resolvedTheme")) {
  fail("controles nativos deben recibir el color-scheme resuelto");
}

if (!layout.includes('import "./theme-system.css"')) fail("RootLayout debe cargar el contrato ART-010");
if (!layout.includes('colorScheme: "light dark"')) fail("viewport no puede declarar exclusivamente dark");
if (!layout.includes('data-theme-preference="system"') || !layout.includes('data-theme="dark"')) {
  fail("RootLayout debe tener fallback SSR explícito y preferencia system");
}
if (!layout.includes('<script src="/theme-init.js" />')) {
  fail("la preferencia guardada debe resolverse antes del primer paint");
}
if (!bootstrap.includes("financial-app:visual-preferences-v1") || !bootstrap.includes("prefers-color-scheme: dark")) {
  fail("theme-init debe resolver almacenamiento local y preferencia del sistema");
}
if (!bootstrap.includes("root.dataset.themePreference") || !bootstrap.includes("root.dataset.theme = resolved")) {
  fail("theme-init debe aplicar preferencia y tema efectivo antes de hidratar");
}

for (const selector of ['html[data-theme="dark"]', 'html[data-theme="light"]']) {
  if (!themeCss.includes(selector)) fail(`falta selector ${selector}`);
}
for (const token of [
  "--color-bg:",
  "--color-surface:",
  "--color-text:",
  "--color-text-secondary:",
  "--surface-navigation:",
  "--gradient-app-canvas:",
  "--shadow-panel:",
]) {
  if (!themeCss.includes(token)) fail(`el tema claro no gobierna ${token}`);
}
const sharedSurfaces = read("app/premium-theme.css");
for (const selector of [".premium-primary-nav", ".configuration-hero", ".config-panel"]) {
  if (!sharedSurfaces.includes(selector)) fail(`falta superficie compartida ${selector}`);
}
for (const file of ["app/transactions/transactions.module.css", "app/accounts/accounts.module.css", "app/budgets/budgets.module.css", "app/documents/documents.module.css"]) {
  const css = read(file);
  if (/(?<![\w-])color:\s*#[0-9a-f]/i.test(css)) fail(`${file} mantiene texto de tema fijo`);
  if (!css.includes("var(--surface-card)")) fail(`${file} debe consumir la superficie compartida`);
}
const themedModules = [
  ["app/transactions/transactions.module.css", ["rgba(24, 50, 99, .72)", "accent-color: #4d8dff"], ["accent-color: var(--color-primary-bright)", "var(--surface-card)"]],
  ["app/documents/documents.module.css", ["#8fb5ff", "#1f6bff", "#1857d8", "#f1f5fc", "background: #fff;"], ["outline:2px solid var(--color-primary-bright)", "var(--color-surface-strong)"]],
  ["app/analysis/analysis.module.css", ["rgba(26, 43, 75, 0.7)"], ["color-mix(in srgb, var(--color-primary) 9%, var(--surface-card))"]],
];
for (const [file, forbidden, required] of themedModules) {
  const css = read(file);
  for (const color of forbidden) if (css.includes(color)) fail(`${file} retiene ${color} que no responde al tema`);
  for (const token of required) if (!css.includes(token)) fail(`${file} no consume ${token}`);
}
if (/!important/.test(themeCss)) fail("el tema no debe depender de parches por ruta con !important");

if (!appearance.includes('data-testid={`theme-${option.value}`}')) fail("faltan test ids de selección de tema");
if (!appearance.includes('data-testid="theme-resolved"')) fail("falta estado del tema efectivo");
if (!appearance.includes("setTheme") || !appearance.includes("resolvedTheme")) {
  fail("Apariencia debe controlar la preferencia y mostrar el tema efectivo");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("✅ ART-010 adaptive theme guard: OK");
console.log("- preferencias: system / light / dark con persistencia local");
console.log("- resolución previa al primer paint + seguimiento en vivo del sistema");
console.log("- tema resuelto gobierna color-scheme, tokens, fondo, navegación y superficies críticas");
console.log("- Inicio, Configuración y Movimientos quedan dentro del contrato representativo");
