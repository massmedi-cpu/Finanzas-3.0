import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const controls = read("app/analysis/analysis-axioma53-controls.tsx");
const tests = read("tests/e2e/user-audit-p3-10.0.89.spec.ts");

const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

requireText(controls, "presetDateFrom(month, quickRange)", "inicio real del rango preset");
requireText(controls, "const customComparisonMax = previousDay(currentPeriodStart)", "comparación sin solapamiento");
requireText(controls, 'params.set("range", quickRange)', "rango rápido preservado");
checks.push([
  !controls.includes('params.set("periodMode", "month")'),
  "comparación avanzada no degrada rangos 3/6/12m a un mes",
]);
requireText(controls, 'periodMode === "year" && year !== initialYear', "dirty state de año");
requireText(controls, 'dateFrom !== initialDateFrom || dateTo !== initialDateTo', "dirty state personalizado");
requireText(tests, "QA-16 · Análisis conserva 3 meses al usar comparación personalizada", "regresión QA-16");
requireText(tests, "QA-17 · cambios de año y fechas personalizadas activan Aplicar cambios", "regresión QA-17");
requireText(tests, 'toHaveAttribute("max", "2026-06-30")', "límite real de comparación 3m");
requireText(tests, 'expect(url.searchParams.get("periodMode")).toBeNull()', "URL conserva modo preset");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Financial App 10.0.91+ · integridad de filtros de Análisis QA-16/17");
