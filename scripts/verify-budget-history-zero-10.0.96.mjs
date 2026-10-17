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
requireText(budgets, 'data-zero={!hasObservedSpend ? "true" : undefined}', "Presupuestos · marca de gasto no observado");
requireText(budgets, 'hasObservedSpend ? Math.max(3, (row.expenseCents / maximum) * 100) : 0', "Presupuestos · cero sin barra fantasma");
requireText(budgets, 'hasObservedSpend ? formatMoney(row.expenseCents) : "—"', "Presupuestos · no mostrar un cero bancario sin cobertura contrastada");
requireText(e2e, "QA-22 · Presupuestos no dibuja gasto para meses exactamente a cero", "regresión QA-22");
requireText(e2e, "REC-BUD-019 · el histórico no convierte un mes sin importaciones en cero confirmado", "regresión de cero bancario incompleto");

console.log(`Financial App ${pkg.version} · QA-22 histórico de Presupuestos sin barras fantasma: OK`);
