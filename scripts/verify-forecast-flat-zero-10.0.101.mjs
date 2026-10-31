import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/forecast-balance-chart.tsx");
const e2e = read("tests/e2e/forecast.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const parts = String(pkg.version ?? "").split(".").map(Number);
const min = [10, 0, 101];
const atLeast = parts.length === 3
  && parts.every(Number.isInteger)
  && (
    parts[0] > min[0]
    || (parts[0] === min[0] && parts[1] > min[1])
    || (parts[0] === min[0] && parts[1] === min[1] && parts[2] >= min[2])
  );
if (!atLeast) throw new Error(`version esperada 10.0.101+, recibida ${pkg.version}`);
requireText(chart, "const flatDomain = minimum === maximum", "Previsión · dominio plano");
requireText(chart, "flatDomain\n    ? 50", "Previsión · centro neutral");
requireText(chart, "const zeroInDomain = minimum <= 0 && maximum >= 0", "Previsión · cero incluido");
requireText(chart, 'data-zero-line="true"', "Previsión · eje cero");
requireText(e2e, "10.0.101 · una previsión plana en 0 € queda centrada sobre el eje cero", "regresión 10.0.101");
requireText(e2e, 'toHaveAttribute("y1", "120")', "regresión · eje centrado");
requireText(e2e, 'expect(pointTops).toEqual(["50%", "50%", "50%"])', "regresión · puntos centrados en apertura, hito y cierre");
requireText(chart, "data-forecast-marker={point.kind}", "Previsión · marcadores auditables");
requireText(e2e, "Consultar un hito de la curva", "regresión · selección accesible en curva densa");

console.log("Financial App 10.0.101 · previsión plana en cero: OK");
