import fs from "node:fs";

const shell = fs.readFileSync("app/app-shell.tsx", "utf8");
const mobile = fs.readFileSync("app/mobile-navigation.tsx", "utf8");
const css = fs.readFileSync("app/app-shell.module.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

function requireText(source, fragment, description) {
  if (!source.includes(fragment)) throw new Error(`Falta ${description}: ${fragment}`);
}

if (pkg.version !== "10.0.30") throw new Error(`package.json debe ser 10.0.30, es ${pkg.version}`);
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  throw new Error("package-lock.json no coincide con package.json");
}

requireText(shell, "prefetch={false}", "carga bajo demanda protegida en AppShell");
requireText(mobile, "prefetch={false}", "carga bajo demanda protegida en MobileNavigation");
requireText(shell, "HIGH_VALUE_PREFETCH_ROUTES", "lista acotada de rutas prioritarias");
requireText(shell, "HIGH_VALUE_PREFETCH_ROUTES.forEach((href) => router.prefetch(href))", "precarga explícita y acotada tras reposo");
requireText(shell, "onMouseEnter={() => router.prefetch(item.href)}", "precarga por intención en escritorio");
requireText(shell, "navigationScrollButton", "controles visibles de desplazamiento");
requireText(shell, "onWheel={handleNavigationWheel}", "desplazamiento con rueda/trackpad");
requireText(shell, "aria-busy={pendingHref ? true : undefined}", "feedback accesible de navegación pendiente");
requireText(shell, "navigationProgress", "indicador visual de navegación pendiente");
requireText(mobile, "primary.forEach((item) => router.prefetch(item.href))", "precarga móvil limitada a accesos primarios");
requireText(mobile, "onTouchStart={() => router.prefetch(item.href)}", "precarga móvil por intención táctil");
requireText(css, "scrollbar-width: thin", "scrollbar horizontal visible");
requireText(css, ".navigationCluster", "contenedor navegable del menú");
requireText(css, "grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem", "flechas laterales del menú");
requireText(css, "@media (max-width: 90rem) and (min-width: 48.01rem)", "segunda fila de navegación en anchos intermedios");
requireText(css, ".navigationCluster,\n  .navigationProgress {\n    display: none;", "ocultación correcta del menú desktop en móvil");

console.log("Navigation Performance 10.0.30 contract: OK");
