import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const preferences = read("app/product-preferences.tsx");
const privacyCss = read("app/product-preferences.css");
const budgetCss = read("app/budget-focus-preference.css");
const layout = read("app/layout.tsx");
const shell = read("app/app-shell.tsx");
const ui = read("app/configuration/preferences/preferences-client.tsx");
const page = read("app/configuration/preferences/page.tsx");
const nav = read("app/configuration/configuration-area-nav.tsx");
const appearance = read("app/configuration/appearance/appearance-client.tsx");
const syncRoute = read("app/api/source/google/sync/route.ts");

checks.push([pkg.version === "10.0.76", "version 10.0.76"]);

for (const token of [
  "budgetFocus",
  "syncOnOpen",
  "privacyOnBlur",
  "homeDestination",
  "financial-app:product-preferences-v1",
  "financial-app:auto-sync-attempted-v1",
  'fetch("/api/source/google/sync"',
  "visibilitychange",
  "financial-privacy-shield",
]) requireText(preferences, token, "runtime-preferencias");

for (const token of [
  "ProductPreferencesProvider",
  'import "./product-preferences.css"',
  'import "./budget-focus-preference.css"',
  'data-privacy-on-blur="true"',
  'data-budget-focus="all"',
]) requireText(layout, token, "integracion-global");

for (const token of [
  "homeDestination",
  "STARTUP_DESTINATION_RESOLVED",
  "router.replace(homeDestination)",
  'pathname === "/"',
]) requireText(shell, token, "pagina-inicial");

for (const token of [
  'html[data-budget-focus="attention"]',
  'class*="budgetCardPrimary"',
  'class*="on_track"',
  'class*="empty"',
]) requireText(budgetCss, token, "preferencia-presupuestos");

for (const token of [
  "backdrop-filter: blur(24px)",
  "position: fixed",
  "z-index: 99999",
]) requireText(privacyCss, token, "privacidad-visual");

for (const token of [
  "Vista por defecto",
  "Intentar sincronizar una vez por sesión",
  "Ocultar la app cuando pierde el foco",
  "Destino del logotipo",
  "Español (España) · EUR",
  "setBudgetFocus",
  "setSyncOnOpen",
  "setPrivacyOnBlur",
  "setHomeDestination",
]) requireText(ui, token, "interfaz-preferencias");

requireText(page, 'import "./preferences.css"', "estilos-preferencias");
requireText(nav, 'href: "/configuration/preferences"', "navegacion-configuracion");

for (const token of ["setTheme", "setDensity", "setReduceMotion", "Vista previa", "Efecto real"]) {
  requireText(appearance, token, "apariencia-existente");
}

for (const token of [
  "createGoogleSourceRuntime",
  "resolveGoogleSourceConnection",
  "synchronize(snapshot)",
]) requireText(syncRoute, token, "sincronizacion-oficial");

const forbidden = [
  [ui.includes("disabled title=\"Próximamente\""), "no debe haber preferencias visibles marcadas como próximamente"],
  [preferences.includes("setInterval("), "la sincronización no debe crear polling continuo"],
];
for (const [present, label] of forbidden) checks.push([!present, label]);

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Financial App 10.0.76 · Fase 8 Configuración · bloque de preferencias reales certificado");
