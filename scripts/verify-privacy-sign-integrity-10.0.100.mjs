import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/financial-bar-chart.tsx");
const chartCss = read("src/design/financial-bar-chart.module.css");
const privacyTest = read("tests/e2e/inicio-privacy-visual.spec.ts");

const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`${label}: falta ${token}`);
};

const versionParts = String(pkg.version ?? "").split(".").map(Number);
const minVersion = [10, 0, 100];
const versionAtLeast = versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (
    versionParts[0] > minVersion[0] ||
    (versionParts[0] === minVersion[0] && versionParts[1] > minVersion[1]) ||
    (versionParts[0] === minVersion[0] && versionParts[1] === minVersion[1] && versionParts[2] >= minVersion[2])
  );
if (!versionAtLeast) throw new Error(`version esperada 10.0.100+, recibida ${pkg.version}`);

requireText(chart, "data-balance-sign={valuesVisible", "Readout · contrato de signo");
requireText(chart, "? styles.readoutNeutral", "Readout · privacidad neutral");
requireText(chart, "selected.operatingNetCents === 0", "Readout · cero neutral");
requireText(chart, ': "hidden"}', "Readout · signo oculto");
requireText(chartCss, ".readoutNeutral", "Readout · estilo neutral");
requireText(privacyTest, "Ocultar importes oculta también el signo visual del balance", "Regresión privacidad de signo");
requireText(privacyTest, "data-balance-sign=\"hidden\"", "Regresión estado oculto");
requireText(privacyTest, "data-balance-sign=\"negative\"", "Regresión signo visible");

const legacy = "className={selected.operatingNetCents < 0 ? styles.readoutNegative : styles.readoutPositive}";
if (chart.includes(legacy)) throw new Error("Readout · el patrón que filtra el signo sigue presente");

console.log(`Financial App ${pkg.version} · privacidad visual del signo: OK`);
