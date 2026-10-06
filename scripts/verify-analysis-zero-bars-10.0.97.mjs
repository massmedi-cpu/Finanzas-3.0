import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const trend = read("src/design/financial-trend-chart.tsx");
const e2e = read("tests/e2e/premium-analysis-visual.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 97];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.97+, recibida ${pkg.version}`);

requireText(trend, 'data-series="income"', "Análisis · serie ingresos");
requireText(trend, 'data-series="expense"', "Análisis · serie gastos");
requireText(trend, 'data-zero={row.incomeCents === 0 ? "true" : undefined}', "Análisis · cero ingresos");
requireText(trend, 'data-zero={row.expenseCents === 0 ? "true" : undefined}', "Análisis · cero gastos");
requireText(trend, 'height={row.incomeCents === 0 ? 0 : Math.max(1, chart.baseline - incomeY)}', "Análisis · altura cero ingresos");
requireText(trend, 'height={row.expenseCents === 0 ? 0 : Math.max(1, chart.baseline - expenseY)}', "Análisis · altura cero gastos");
requireText(e2e, "QA-23 · Análisis no dibuja barras para ingresos o gastos exactamente a cero", "regresión QA-23");

console.log(`Financial App ${pkg.version} · QA-23 barras cero de Análisis: OK`);
