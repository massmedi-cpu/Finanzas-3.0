import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/forecast-balance-chart.tsx");
const e2e = read("tests/e2e/forecast.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

if (pkg.version !== "10.0.101") throw new Error(`version esperada 10.0.101, recibida ${pkg.version}`);
requireText(chart, "const flatDomain = minimum === maximum", "Previsión · dominio plano");
requireText(chart, "flatDomain\n    ? 50", "Previsión · centro neutral");
requireText(chart, "const zeroInDomain = minimum <= 0 && maximum >= 0", "Previsión · cero incluido");
requireText(chart, 'data-zero-line="true"', "Previsión · eje cero");
requireText(e2e, "10.0.101 · una previsión plana en 0 € queda centrada sobre el eje cero", "regresión 10.0.101");
requireText(e2e, 'toHaveAttribute("y1", "120")', "regresión · eje centrado");
requireText(e2e, 'expect(pointTops).toEqual(["50%", "50%"])', "regresión · puntos centrados");

console.log("Financial App 10.0.101 · previsión plana en cero: OK");
