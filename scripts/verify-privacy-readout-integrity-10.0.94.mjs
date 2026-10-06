import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/financial-bar-chart.tsx");
const e2e = read("tests/e2e/inicio-smart-brief.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const parts = String(pkg.version ?? "").split(".").map(Number);
const min = [10, 0, 94];
const atLeast = parts.length === 3
  && parts.every(Number.isInteger)
  && (
    parts[0] > min[0]
    || (parts[0] === min[0] && parts[1] > min[1])
    || (parts[0] === min[0] && parts[1] === min[1] && parts[2] >= min[2])
  );

if (!atLeast) throw new Error(`version esperada 10.0.94+, recibida ${pkg.version}`);

requireText(chart, "{valuesVisible ? (", "detalle mensual · rama de privacidad");
requireText(chart, "<span>Importes ocultos por privacidad</span>", "detalle mensual · copy protegido");
requireText(chart, "Ingresos {formatMoney(selected.incomeCents)}", "detalle mensual · ingreso exacto");
requireText(chart, "Gastos {formatMoney(selected.expenseCents)}", "detalle mensual · gasto exacto");
requireText(chart, "Balance {formatMoney(selected.operatingNetCents)}", "detalle mensual · neto exacto");
requireText(e2e, "QA-20 · privacidad no filtra importes por el detalle mensual", "regresión QA-20");
requireText(e2e, 'not.toContainText("€")', "QA-20 · ausencia de moneda visible");

console.log(`Financial App ${pkg.version} · privacidad de readout mensual QA-20: OK`);
