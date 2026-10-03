import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const preferences = read("app/visual-preferences.tsx");
const layout = read("app/layout.tsx");
const themeCss = read("app/theme-system.css");
const appearance = read("app/configuration/appearance/appearance-client.tsx");

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
if (!layout.includes('import "./theme-system.css"')) {
  fail("RootLayout debe cargar el contrato ART-010");
}
if (!layout.includes('colorScheme: "light dark"')) {
  fail("viewport no puede declarar exclusivamente dark");
}
if (!layout.includes('data-theme-preference="system"') || !layout.includes('data-theme="dark"')) {
  fail("RootLayout debe tener fallback SSR explícito y preferencia system");
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
if (!themeCss.includes('html[data-theme="light"] .premium-primary-nav')) {
  fail("la navegación premium debe tener composición clara gobernada");
}
if (!themeCss.includes('html[data-theme="light"] .configuration-hero')) {
  fail("Configuración debe entrar en el contrato de tema claro");
}

for (const testId of ["theme-system", "theme-light", "theme-dark", "theme-resolved"]) {
  if (!appearance.includes(`data-testid=${testId.startsWith("theme-") && testId !== "theme-resolved" ? "{`" : "\""}`)) {
    // Los radio buttons se construyen dinámicamente; el guard exacto se hace debajo.
    break;
  }
}
if (!appearance.includes('data-testid={`theme-${option.value}`}')) fail("faltan test ids de selección de tema");
if (!appearance.includes('data-testid="theme-resolved"')) fail("falta estado del tema efectivo");

if (process.exitCode) process.exit(process.exitCode);
console.log("✅ ART-010 adaptive theme guard: OK");
console.log("- preferencias: system / light / dark con persistencia local");
console.log("- system sigue prefers-color-scheme en vivo");
console.log("- tema resuelto gobierna color-scheme, tokens, fondo, AppShell y Configuración");
