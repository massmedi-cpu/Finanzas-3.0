import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const home = read("app/home-evolution.tsx");
const bars = read("src/design/financial-bar-chart.tsx");
const homeCss = read("app/inicio-overview.module.css");
const barsCss = read("src/design/financial-bar-chart.module.css");
const e2e = read("tests/e2e/inicio-smart-brief.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

if (pkg.version !== "10.0.91") throw new Error(`version esperada 10.0.91, recibida ${pkg.version}`);
requireText(home, "value === 0 ? 0 : Math.max", "Inicio · serie única");
requireText(home, 'data-zero={value === 0 ? "true" : undefined}', "Inicio · marca de cero");
requireText(bars, "row.incomeCents === 0 ? 0 : Math.max", "Ingresos · cero");
requireText(bars, "row.expenseCents === 0 ? 0 : Math.max", "Gastos · cero");
requireText(bars, 'data-zero={valuesVisible && row.incomeCents === 0 ? "true" : undefined}', "Ingresos · marca de cero");
requireText(homeCss, '.evolutionSingleBar[data-zero="true"]', "CSS Inicio");
requireText(barsCss, '.incomeBar[data-zero="true"]', "CSS barras");
requireText(e2e, "QA-11 · las gráficas no dibujan barras positivas para valores exactamente cero", "regresión QA-11");
requireText(home, 'data-zero-line="true"', "línea cero Flujo neto");
requireText(home, 'data-sign={sign}', "signo visual Flujo neto");
requireText(home, "No hay saldos bancarios disponibles para este periodo.", "estado vacío Saldo");
requireText(homeCss, ".evolutionSignedBar[data-sign=\"negative\"]", "negativos bajo línea cero");
requireText(e2e, "QA-12 · Flujo neto sitúa positivos y negativos a lados opuestos de cero", "regresión QA-12");
requireText(e2e, "QA-13 · Saldo explica una serie bancaria vacía", "regresión QA-13");

console.log("Financial App 10.0.91 · coherencia de evolución QA-11/12/13: OK");
