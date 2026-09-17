import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const insights = readFileSync("app/analysis/analysis-movement-insights.tsx", "utf8");
const styles = readFileSync("app/analysis/analysis-movement-insights.module.css", "utf8");

test("Análisis · las gráficas tienen escalas explícitas y valores interpretables", () => {
  expect(insights).toContain("Evolución diaria del gasto del periodo con escala en euros");
  expect(insights).toContain("Relación entre frecuencia de compra e importe medio por comercio con ejes numéricos");
  expect(insights).toContain("Curva de concentración del gasto por comercio con escala porcentual");
  expect(insights).toContain("Número de compras");
  expect(insights).toContain("Importe medio por compra");
  expect(insights).toContain("Número de comercios acumulados");
  expect(insights).toContain("const yTicks = [0, 0.5, 0.8, 1]");
  expect(insights).toContain("formatMoney(row.expenseCents)");
});

test("Análisis · la maquetación no iguala alturas entre tarjetas de distinta densidad", () => {
  expect(insights).toContain("styles.chartColumns");
  expect(insights).toContain("styles.chartColumn");
  expect(styles).toContain(".chartColumns { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
  expect(styles).toContain("align-items: start");
  expect(styles).toContain("align-content: start");
  expect(styles).not.toContain(".chartGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
});

test("Análisis · el mapa de calor deja de usar la altura mínima de la gráfica diaria", () => {
  expect(insights).toContain("styles.heatmapChart");
  expect(insights).toContain("styles.heatmapDayLabel");
  expect(insights).toContain("Menor gasto");
  expect(insights).toContain("Mayor gasto");
  expect(styles).toContain(".heatmapChart");
  expect(styles).not.toContain("dailyChart { min-height: 13rem; }");
});
