import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const home = read("app/home-evolution.tsx");
const e2e = read("tests/e2e/inicio-smart-brief.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const parts = String(pkg.version ?? "").split(".").map(Number);
const min = [10, 0, 93];
const atLeast = parts.length === 3
  && parts.every(Number.isInteger)
  && (
    parts[0] > min[0]
    || (parts[0] === min[0] && parts[1] > min[1])
    || (parts[0] === min[0] && parts[1] === min[1] && parts[2] >= min[2])
  );

if (!atLeast) throw new Error(`version esperada 10.0.93+, recibida ${pkg.version}`);

requireText(home, "const balanceHasNegative = useMemo(", "Saldo · detección de negativos");
requireText(home, "row.accounts > 0 && row.balanceCents < 0", "Saldo · negativo solo con dato");
requireText(home, "signed={balanceHasNegative}", "Saldo · eje cero condicionado");
requireText(home, "const visualSigned = signed && valuesVisible", "Saldo · privacidad del signo");
requireText(home, 'data-zero-line="true"', "Saldo · línea cero");
requireText(home, 'data-sign={sign}', "Saldo · signo visual");
requireText(e2e, "QA-19 · Saldo sitúa balances negativos bajo cero", "regresión QA-19");
requireText(e2e, 'data-sign="negative"', "QA-19 · selector negativo");
requireText(e2e, 'data-sign="positive"', "QA-19 · selector positivo");

console.log(`Financial App ${pkg.version} · signo visual de Saldo QA-19: OK`);
