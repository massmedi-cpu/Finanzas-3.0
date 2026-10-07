import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const accounts = read("app/accounts/accounts-client.tsx");
const visualTest = read("tests/e2e/premium-accounts-visual.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 99];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.99+, recibida ${pkg.version}`);

requireText(accounts, "function activityBarWidth(value: number, scale: number)", "Cuentas · helper de escala");
requireText(accounts, "return magnitude === 0 ? 0 : Math.max(2, (magnitude / scale) * 100);", "Cuentas · cero exacto");
requireText(accounts, 'data-zero={row.incomeCents === 0 ? "true" : undefined}', "Cuentas · ingresos cero");
requireText(accounts, 'data-zero={row.expenseCents === 0 ? "true" : undefined}', "Cuentas · gastos cero");
requireText(accounts, 'data-zero={row.operatingNetCents === 0 ? "true" : undefined}', "Cuentas · neto cero");
requireText(visualTest, "Cuentas no dibuja barras fantasma para valores exactamente 0 €", "Regresión visual");

for (const legacy of [
  "Math.max(2, (row.incomeCents / scale) * 100)",
  "Math.max(2, (row.expenseCents / scale) * 100)",
  "Math.max(2, (Math.abs(row.operatingNetCents) / scale) * 100)",
]) {
  if (accounts.includes(legacy)) throw new Error(`Cuentas · patrón fantasma aún presente: ${legacy}`);
}

console.log(`Financial App ${pkg.version} · integridad visual de ceros en Cuentas: OK`);
