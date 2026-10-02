import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];

function requireMatch(path, pattern, label) {
  const content = read(path);
  if (!pattern.test(content)) failures.push(`${label} (${path})`);
}

function requireAbsent(path, pattern, label) {
  const content = read(path);
  if (pattern.test(content)) failures.push(`${label} (${path})`);
}

requireMatch("app/visual-preferences.tsx", /type VisualDensity = "comfortable" \| "compact"/, "densidades Cómoda/Compacta");
requireMatch("app/visual-preferences.tsx", /financial-app:visual-preferences-v1/, "persistencia de preferencias visuales");
requireMatch("app/visual-preferences.tsx", /root\.dataset\.density = preferences\.density/, "densidad aplicada globalmente");
requireMatch("app/visual-preferences.tsx", /root\.dataset\.reduceMotion = preferences\.reduceMotion/, "Reducir movimiento aplicado globalmente");
requireMatch("app/configuration/configuration-area-nav.tsx", /\/configuration\/appearance/, "Apariencia accesible desde Configuración");
requireMatch("app/configuration/appearance/appearance-client.tsx", /Cómoda/, "control de densidad cómoda");
requireMatch("app/configuration/appearance/appearance-client.tsx", /Compacta/, "control de densidad compacta");
requireMatch("app/configuration/appearance/appearance-client.tsx", /Reducir movimiento/, "opción interna Reducir movimiento");
requireMatch("app/configuration/appearance/appearance-client.tsx", /aria-live="polite"/, "feedback accesible de preferencias");
requireMatch("app/visual-preferences.css", /html\[data-density="compact"\]/, "reglas globales de densidad compacta");
requireMatch("app/visual-preferences.css", /prefers-reduced-motion:\s*reduce/, "preferencia de movimiento del sistema");
requireMatch("app/visual-preferences.css", /html\[data-reduce-motion="true"\][\s\S]*animation-duration/, "opción interna reduce animaciones");
requireMatch("app/layout.tsx", /VisualPreferencesProvider/, "provider integrado en layout raíz");
requireMatch("app/layout.tsx", /visual-preferences\.css/, "CSS de preferencias integrado");
requireMatch(".github/workflows/responsive-matrix-10.0.49.yml", /Responsive Matrix/, "matriz responsive existente");
requireMatch(".github/workflows/navigation-performance.yml", /navigation-performance-10\.0\.30\.spec\.ts/, "gate de navegación/rendimiento existente");

const preferenceCss = read("app/visual-preferences.css");
const compactSection = preferenceCss.split("/*\n * La preferencia interna REDUCIR MOVIMIENTO")[0];
if (/--font-|font-size\s*:/.test(compactSection)) {
  failures.push("Compacta no puede modificar tipografía (app/visual-preferences.css)");
}

requireAbsent("app/visual-preferences.css", /data-density="compact"[\s\S]*min-height:\s*(?:[0-2](?:\.\d+)?rem|[0-3]\dpx)/, "Compacta no debe reducir áreas táctiles por debajo del mínimo");

if (failures.length) {
  console.error("PRE-037 · incumplimientos Axioma §§91–108:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PRE-037 · contrato estático Axioma §§91–108: OK");
console.log("Densidad: modifica espaciado, no tipografía. Movimiento: preferencia interna + prefers-reduced-motion.");
