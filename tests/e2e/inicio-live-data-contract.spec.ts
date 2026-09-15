import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
const inicioSource = readFileSync(resolve(process.cwd(), "app/inicio-client.tsx"), "utf8");
const dashboardApiSource = readFileSync(resolve(process.cwd(), "app/api/dashboard/route.ts"), "utf8");
const chartSource = readFileSync(resolve(process.cwd(), "src/design/financial-bar-chart.tsx"), "utf8");

test("Inicio prioriza datos útiles y deja de abrir con un saldo total aislado", () => {
  expect(pageSource).toContain('import InicioClient from "./inicio-client"');
  expect(inicioSource).toContain("Resumen financiero principal");
  expect(inicioSource).toContain("Ingresos del mes");
  expect(inicioSource).toContain("Gastos del mes");
  expect(inicioSource).toContain("Balance del mes");
  expect(inicioSource).toContain("Tasa de ahorro");
  expect(inicioSource).not.toContain("balanceSummary");
  expect(inicioSource).not.toContain("Tu dinero, claro en segundos");
});

test("Inicio prioriza diez movimientos y expone la fecha real de los datos", () => {
  expect(dashboardApiSource).toContain('if (scope === "primary") return [financial, transactions]');
  expect(dashboardApiSource).toContain("limit: 10");
  expect(dashboardApiSource).toContain("dataThroughDate: latestBankDate(data)");
  expect(inicioSource).toContain("Últimos 10 movimientos");
  expect(inicioSource).toContain("Los datos bancarios no están al día");
  expect(inicioSource).toContain('href="/api/source/google/connect"');
  expect(inicioSource).toContain("latestDataDate");
});

test("la gráfica no representa el balance negativo como una barra positiva", () => {
  expect(chartSource).not.toContain("Math.abs(row.operatingNetCents)");
  expect(chartSource).not.toContain("styles.netBar");
  expect(chartSource).toContain("El balance se muestra como cifra con signo");
  expect(chartSource).toContain("partialMonthStart");
  expect(inicioSource).toContain("Último mes completo");
  expect(inicioSource).toContain("El mes actual es parcial");
});
