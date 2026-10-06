import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const home = read("app/home-evolution.tsx");
const css = read("app/inicio-overview.module.css");
const e2e = read("tests/e2e/inicio-smart-brief.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 92];
const versionAtLeast = versionParts.length === 3
  && versionParts.every(Number.isInteger)
  && (
    versionParts[0] > minVersion[0]
    || (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1])
    || (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );

if (!versionAtLeast) throw new Error(`version esperada 10.0.92+, recibida ${pkg.version}`);

requireText(home, "availableFor?:", "serie única · disponibilidad");
requireText(home, "const available = availableFor ? availableFor(row) : true", "serie única · discriminación");
requireText(home, 'data-series-missing="true"', "serie única · hueco de cobertura");
requireText(home, '"Sin dato"', "serie única · copy sin dato");
requireText(home, "balanceAvailablePoints", "Saldo · cobertura disponible");
requireText(home, "balanceMissingPoints", "Saldo · cobertura ausente");
requireText(home, "Cobertura parcial:", "Saldo · explicación parcial");
requireText(home, "no como 0 €", "Saldo · no confundir ausencia con cero");
requireText(home, "availableFor={(row) => (row as BalanceRow).accounts > 0}", "Saldo · disponibilidad por cuentas");
requireText(css, ".evolutionMissingMarker", "Saldo · marcador neutral");
requireText(e2e, "QA-18 · Saldo no convierte meses sin cobertura en ceros reales", "regresión QA-18");

console.log(`Financial App ${pkg.version} · cobertura parcial de Saldo QA-18: OK`);
