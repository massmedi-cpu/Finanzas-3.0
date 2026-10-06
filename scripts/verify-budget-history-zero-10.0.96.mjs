import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const budgets = read("app/budgets/budgets-client.tsx");
const e2e = read("tests/e2e/budgets.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 96];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.96+, recibida ${pkg.version}`);

requireText(budgets, 'data-budget-history-bar="true"', "Presupuestos · marca de histórico");
requireText(budgets, 'data-zero={row.expenseCents === 0 ? "true" : undefined}', "Presupuestos · marca de cero");
requireText(budgets, 'row.expenseCents === 0 ? 0 : Math.max(3, (row.expenseCents / maximum) * 100)', "Presupuestos · cero sin barra fantasma");
requireText(e2e, "QA-22 · Presupuestos no dibuja gasto para meses exactamente a cero", "regresión QA-22");

console.log(`Financial App ${pkg.version} · QA-22 histórico de Presupuestos sin barras fantasma: OK`);
