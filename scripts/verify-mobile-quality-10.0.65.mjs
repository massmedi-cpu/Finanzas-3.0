import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const touch = read("app/touch-targets.css");
const shell = read("app/app-shell.module.css");
const matrix = read("tests/e2e/responsive-matrix-10.0.49.spec.ts");
const mobileGate = read("tests/e2e/mobile-quality-10.0.65.spec.ts");
const forecast = read("app/forecast/forecast.module.css");

requireMatch(touch, /@media\s*\(max-width:\s*480px\)/, "MOB-001: falta el contrato móvil <=480px");
requireMatch(touch, /#main-content button[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/, "MOB-001: los botones del contenido no garantizan 44x44");
requireMatch(touch, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[\s\S]*?min-height:\s*44px;/, "MOB-001: los campos móviles no garantizan 44px");
requireMatch(touch, /font-size:\s*max\(var\(--font-helper\),\s*1em\)/, "MOB-003: falta el mínimo tipográfico móvil para metadata/estado");
requireMatch(forecast, /\.primaryButton,[\s\S]*?\.textButton\s*\{[\s\S]*?min-height:\s*44px;/, "MOB-001: Previsión perdió el mínimo táctil común");
requireMatch(forecast, /\.reasonInput[\s\S]*?min-height:\s*44px;/, "MOB-001: reasonInput de Previsión debe medir al menos 44px");

for (const width of [360, 430]) {
  requireMatch(matrix, new RegExp(`width:\\s*${width}\\b`), `MOB-004: la matriz no contiene ${width}px`);
}
requireMatch(mobileGate, /width:\s*480\b/, "MOB-004: el gate 10.0.65 debe conservar 480px");
requireMatch(matrix, /"\/configuration\/source"/, "MOB-005: /configuration/source no está en la matriz principal");
requireMatch(mobileGate, /page\.goto\("\/configuration\/source"\)/, "MOB-005: falta barrido móvil específico de Fuente");
requireMatch(mobileGate, /width:\s*390,\s*height:\s*568/, "MOB-007: falta viewport bajo estable");
requireMatch(mobileGate, /scrollIntoViewIfNeeded\(\)/, "MOB-007: falta comprobar alcance del campo enfocado");
requireMatch(mobileGate, /\.focus\(\)/, "MOB-007: falta foco real de formulario");
requireMatch(mobileGate, /oculto bajo el dock fijo/, "MOB-007: falta comprobar oclusión por navegación fija");

requireMatch(shell, /env\(safe-area-inset-bottom\)/, "MOB-008: el AppShell perdió safe-area inferior");
requireMatch(shell, /\.mobileNavigation[\s\S]*?position:\s*fixed;/, "MOB-002: la navegación móvil persistente dejó de ser fija");
requireMatch(shell, /\.mobileDockLink[\s\S]*?min-height:\s*3\.4rem;/, "MOB-002/MOB-001: el dock móvil perdió su altura táctil");

console.log("Mobile quality 10.0.65: OK");
