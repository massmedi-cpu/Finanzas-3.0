import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/forecast-balance-chart.tsx");
const styles = read("src/design/forecast-balance-chart.module.css");
const e2e = read("tests/e2e/forecast.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const parts = String(pkg.version ?? "").split(".").map(Number);
const min = [10, 0, 95];
const atLeast = parts.length === 3
  && parts.every(Number.isInteger)
  && (
    parts[0] > min[0]
    || (parts[0] === min[0] && parts[1] > min[1])
    || (parts[0] === min[0] && parts[1] === min[1] && parts[2] >= min[2])
  );
if (!atLeast) throw new Error(`version esperada 10.0.95+, recibida ${pkg.version}`);

requireText(chart, "const zeroInDomain = minimum <= 0 && maximum >= 0 && minimum !== maximum", "Previsión · dominio cero");
requireText(chart, "const zeroY = zeroInDomain ? coordinateFor(0) * 2.4 : null", "Previsión · coordenada cero");
requireText(chart, 'data-zero-line="true"', "Previsión · referencia cero");
requireText(chart, "y1={zeroY}", "Previsión · y1 real");
requireText(chart, "y2={zeroY}", "Previsión · y2 real");
if (chart.includes('y1="120" y2="120"')) throw new Error("Previsión · persiste la falsa línea central fija");
requireText(styles, ".zeroLine", "Previsión · estilo referencia cero");
requireText(e2e, "QA-21 · la curva de saldo coloca el cero en su escala real", "regresión QA-21");
requireText(e2e, "expect(y1).toBeGreaterThan(180)", "QA-21 · geometría real");
requireText(e2e, "Math.abs(y1 - 120)", "QA-21 · descarta centro falso");

console.log(`Financial App ${pkg.version} · eje cero real de Previsión QA-21: OK`);
