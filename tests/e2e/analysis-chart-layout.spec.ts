import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const insights = readFileSync(join(process.cwd(), "app/analysis/analysis-movement-insights.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "app/analysis/analysis-movement-insights.module.css"), "utf8");

test.describe("Análisis · legibilidad de gráficas", () => {
  test("mantiene escalas, valores y contexto visibles", () => {
    expect(insights).toContain("Evolución diaria del gasto del periodo con escala en euros");
    expect(insights).toContain("styles.heatmapDayLabel");
    expect(insights).toContain("formatMoney(row.expenseCents)");
    expect(insights).toContain("Gasto por día de la semana con importe y número de movimientos");
    expect(insights).toContain("Relación entre frecuencia de compra e importe medio por comercio con ejes numéricos");
    expect(insights).toContain("Número de compras");
    expect(insights).toContain("Importe medio por compra");
    expect(insights).toContain("styles.pointLabel");
    expect(insights).toContain("Curva de concentración del gasto por comercio con escala porcentual");
    expect(insights).toContain("Número de comercios acumulados");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).not.toMatch(/\.gridLine text\s*\{\s*display:\s*none/);
    expect(styles).not.toMatch(/\.weekdayColumn small\s*\{\s*display:\s*none/);
  });

  test("las tarjetas de distinta densidad no comparten una fila de altura forzada", () => {
    expect(insights).toContain("styles.chartColumns");
    expect(insights).toContain("styles.chartColumn");
    expect(styles).toContain(".chartColumns { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
    expect(styles).toContain("align-content: start");
    expect(styles).not.toContain(".chartGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
  });

  test("el mapa de calor conserva fechas identificables y tamaño útil", () => {
    expect(insights).toContain("dayOfMonth: date.getUTCDate()");
    expect(insights).toContain("const cell = 22");
    expect(insights).toContain("días con gasto");
    expect(styles).toContain(".heatmapDayLabel");
    expect(styles).toContain(".heatmapChart");
  });
});
