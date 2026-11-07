import fs from "node:fs";

const shell = fs.readFileSync("app/app-shell.tsx", "utf8");
const mobile = fs.readFileSync("app/mobile-navigation.tsx", "utf8");
const css = fs.readFileSync("app/app-shell.module.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

function requireText(source, fragment, description) {
  if (!source.includes(fragment)) throw new Error(`Falta ${description}: ${fragment}`);
}

function versionAtLeast(current, minimum) {
  const currentParts = current.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  if (currentParts.length !== 3 || currentParts.some((value) => !Number.isInteger(value) || value < 0)) return false;
  if (minimumParts.length !== 3 || minimumParts.some((value) => !Number.isInteger(value) || value < 0)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] > minimumParts[index]) return true;
    if (currentParts[index] < minimumParts[index]) return false;
  }
  return true;
}

if (!versionAtLeast(pkg.version, "10.0.30")) {
  throw new Error(`package.json debe conservar navegación >=10.0.30, es ${pkg.version}`);
}
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  throw new Error("package-lock.json no coincide con package.json");
}

requireText(shell, "prefetch={false}", "carga bajo demanda protegida en AppShell");
requireText(mobile, "prefetch={false}", "carga bajo demanda protegida en MobileNavigation");
if (shell.includes("HIGH_VALUE_PREFETCH_ROUTES") || mobile.includes("primary.forEach((item) => router.prefetch(item.href))")) {
  throw new Error("La navegación no debe iniciar precargas automáticas que compitan con el resumen financiero.");
}
requireText(shell, "onMouseEnter={() => router.prefetch(item.href)}", "precarga por intención en escritorio");
requireText(shell, "navigationScrollButton", "controles visibles de desplazamiento");
requireText(shell, "onWheel={handleNavigationWheel}", "desplazamiento con rueda/trackpad");
requireText(shell, "aria-busy={pendingHref ? true : undefined}", "feedback accesible de navegación pendiente");
requireText(shell, "navigationProgress", "indicador visual de navegación pendiente");
requireText(mobile, "onTouchStart={() => router.prefetch(item.href)}", "precarga móvil por intención táctil");
requireText(css, "scrollbar-width: thin", "scrollbar horizontal visible");
requireText(css, ".navigationCluster", "contenedor navegable del menú");
requireText(css, "grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem", "flechas laterales del menú");
requireText(css, "@media (width < 68.75rem) and (min-width: 48.01rem)", "segunda fila de navegación en tablet");
requireText(css, "@media (min-width: 68.75rem)", "navegación lateral de escritorio");
requireText(css, ".navigationCluster,\n  .navigationProgress {\n    display: none;", "ocultación correcta del menú desktop en móvil");

console.log(`Navigation Performance 10.0.30+ contract: OK (${pkg.version})`);
