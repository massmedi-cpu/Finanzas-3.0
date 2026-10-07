import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const component = read("src/design/contribution-chart.tsx");
const css = read("src/design/contribution-chart.module.css");
const visualTest = read("tests/e2e/premium-analysis-visual.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 99];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.99+, recibida ${pkg.version}`);

requireText(component, 'data-zero={row.expenseCents === 0 ? "true" : undefined}', "Contribución · actual cero");
requireText(component, 'data-zero={row.previousExpenseCents === 0 ? "true" : undefined}', "Contribución · anterior cero");
requireText(css, '.compareTrack i[data-zero="true"]', "Contribución · selector CSS cero");
requireText(css, "min-width: 0;", "Contribución · mínimo anulado");
requireText(visualTest, 'name: "Solo anterior"', "Contribución · fixture de periodo previo");
requireText(visualTest, "zeroCurrentBar", "Contribución · regresión visual");

console.log(`Financial App ${pkg.version} · integridad visual de ceros en contribución: OK`);
