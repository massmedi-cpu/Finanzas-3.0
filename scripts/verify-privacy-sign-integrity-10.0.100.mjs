import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const chart = read("src/design/financial-bar-chart.tsx");
const chartCss = read("src/design/financial-bar-chart.module.css");
const inicio = read("app/inicio-overview.tsx");
const smartBrief = read("app/home-smart-brief.tsx");
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
requireText(inicio, "const financialSign = (value: number)", "Inicio · helper de signo");
requireText(inicio, 'data-financial-sign={financial ? financialSign(financial.period.operatingNetCents) : undefined}', "Inicio · balance mensual protegido");
requireText(inicio, 'data-budget-progress-privacy={revealAmounts ? "visible" : "hidden"}', "Inicio · progreso presupuestario protegido");
requireText(inicio, 'data-budget-ranking-privacy="hidden"', "Inicio · ranking presupuestario protegido");
requireText(inicio, '"Ahorro oculto por privacidad"', "Inicio · tasa de ahorro protegida");
requireText(inicio, 'if (revealAmounts && (financial?.period.operatingNetCents ?? 0) < 0)', "Inicio · alerta de signo condicionada");
requireText(smartBrief, "valuesVisible: boolean;", "Lectura rápida · contrato de privacidad");
requireText(smartBrief, '"Balance del mes protegido"', "Lectura rápida · signo textual neutral");
requireText(smartBrief, 'tone: !movementInMonth ? "warning" : !valuesVisible ? "neutral"', "Lectura rápida · tono neutral");
requireText(smartBrief, '"Porcentaje oculto por privacidad."', "Lectura rápida · porcentaje protegido");
requireText(inicio, "privacyActive={privacyReady && !amountsVisible}", "Inicio · privacidad lista antes de borrar referencia");
requireText(smartBrief, "privacyActive: boolean;", "Lectura rápida · estado explícito de privacidad");
requireText(smartBrief, "localStorage.removeItem(HOME_VISIT_KEY)", "Lectura rápida · borrado de referencia local");
requireText(smartBrief, "if (!valuesVisible || loading", "Lectura rápida · persistencia pausada");
requireText(smartBrief, '"Privacidad activa · referencia monetaria local eliminada"', "Lectura rápida · disclosure local");
requireText(smartBrief, "La comparación entre visitas está pausada mientras ocultas importes.", "Lectura rápida · comparación pausada");
requireText(privacyTest, "Ocultar importes oculta también el signo visual del balance", "Regresión privacidad de signo");
requireText(privacyTest, "data-balance-sign=\"hidden\"", "Regresión estado oculto");
requireText(privacyTest, "data-balance-sign=\"negative\"", "Regresión signo visible");

const legacy = "className={selected.operatingNetCents < 0 ? styles.readoutNegative : styles.readoutPositive}";
if (chart.includes(legacy)) throw new Error("Readout · el patrón que filtra el signo sigue presente");
for (const pattern of ["className={(financial?.period.operatingNetCents ?? 0) < 0 ? styles.negative : styles.positive}","className={(forecast?.summary.projectedNetCents ?? 0) < 0 ? styles.negative : styles.positive}","className={completedComparison.current.operatingNetCents < 0 ? styles.negative : styles.positive}","className={item.amountCents < 0 ? styles.negative : styles.positive}","className={row.amountCents < 0 ? styles.negative : styles.positive}"]) {
  if (inicio.includes(pattern)) throw new Error(`Inicio · patrón de signo sin privacidad aún presente: ${pattern}`);
}

console.log(`Financial App ${pkg.version} · privacidad integral de signos y proporciones en Inicio: OK`);
