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

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 91];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.91+, recibida ${pkg.version}`);
requireText(home, "value === 0 ? 0 : Math.max", "Inicio · serie única");
requireText(home, 'data-zero={valuesVisible && value === 0 ? "true" : undefined}', "Inicio · marca de cero protegida por privacidad");
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
requireText(home, "const balanceHasAccounts", "detección de serie sin cuentas");
requireText(e2e, "QA-13 · Saldo explica una serie sin cuentas", "regresión QA-13");
requireText(home, "const valuesVisible = formatMoney(0) !== formatMoney(1)", "privacidad serie única");
requireText(home, "const visualSigned = signed && valuesVisible", "privacidad signo");
requireText(home, 'data-series-bar="true"', "marca de barra neutral");
requireText(home, "Importes, signos y proporciones ocultos por privacidad.", "texto privacidad");
requireText(e2e, "QA-14 · privacidad oculta también proporciones y signo", "regresión QA-14");
requireText(home, "reconstructedBalancePoints", "cobertura de saldo reconstruido");
requireText(home, "Cobertura mixta:", "aviso de cobertura mixta");
requireText(home, "saldo inicial + movimientos", "origen de reconstrucción");
requireText(e2e, "QA-15 · Saldo hace visible cuándo un punto incluye cuentas reconstruidas", "regresión QA-15");

console.log(`Financial App ${pkg.version} · coherencia de evolución 10.0.91+ QA-11/12/13/14/15: OK`);
