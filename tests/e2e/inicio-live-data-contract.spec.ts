import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
const inicioSource = readFileSync(resolve(process.cwd(), "app/inicio-overview.tsx"), "utf8");
const dashboardApiSource = readFileSync(resolve(process.cwd(), "app/api/dashboard/route.ts"), "utf8");
const chartSource = readFileSync(resolve(process.cwd(), "src/design/financial-bar-chart.tsx"), "utf8");
const chartCss = readFileSync(resolve(process.cwd(), "src/design/financial-bar-chart.module.css"), "utf8");

test("Inicio prioriza decisiones y deja de abrir con un saldo total aislado", () => {
  expect(pageSource).toContain('import InicioOverview from "./inicio-overview"');
  expect(inicioSource).toContain("Resumen financiero principal");
  expect(inicioSource).toContain("Saldo total en cuentas");
  expect(inicioSource).toContain("Este mes");
  expect(inicioSource).toContain("Próximos 30 días");
  expect(inicioSource).toContain("Gasto medio mensual");
  expect(inicioSource).toContain("Necesita tu atención");
  expect(inicioSource).not.toContain("Por revisar");
  expect(inicioSource).not.toContain("Revisar movimientos");
  expect(inicioSource).not.toContain("pendingRecent");
  expect(inicioSource).not.toContain("balanceSummary");
  expect(inicioSource).not.toContain("Tu dinero, claro en segundos");
});

test("Inicio usa el resultado real de sincronización y nunca ofrece reconectar una cuenta gestionada", () => {
  expect(dashboardApiSource).toContain('if (scope === "primary") return [financial, transactions]');
  expect(dashboardApiSource).toContain("limit: 10");
  expect(dashboardApiSource).toContain("dataThroughDate: latestBankDate(data)");
  expect(inicioSource).toContain('readJson<SyncStatus>("/api/source/google/sync"');
  expect(inicioSource).toContain('fetch("/api/source/google/sync"');
  expect(inicioSource).toContain('method: "POST"');
  expect(inicioSource).toContain("Última sincronización completada");
  expect(inicioSource).toContain("dataThroughDate ?? transactions?.rows?.[0]?.bankDate ?? null");
  expect(inicioSource).toContain("Actualizar datos");
  expect(inicioSource).not.toContain("Reconectar Google");
  expect(inicioSource).not.toContain("/api/source/google/connect");
  expect(inicioSource).not.toContain("lagDays");
  expect(inicioSource).not.toContain("sourceStale");
});

test("Inicio evita porcentajes de ahorro absurdos cuando no hay base de ingresos suficiente", () => {
  expect(inicioSource).toContain("hasSavingsBase");
  expect(inicioSource).toContain("Ahorro: sin base suficiente");
  expect(inicioSource).toContain("financial?.period.incomeCents ?? 0");
});

test("el cash flow de Inicio muestra 12 meses sin scroll horizontal", () => {
  expect(inicioSource).toContain("data.monthly?.rows.slice(-12)");
  expect(inicioSource).toContain("Últimos 12 meses");
  expect(dashboardApiSource).toContain("trailingMonthStart(today, 12)");
  expect(chartSource).not.toContain("Math.abs(row.operatingNetCents)");
  expect(chartSource).not.toContain("styles.netBar");
  expect(chartSource).toContain("Toca un mes para ver las cifras exactas");
  expect(chartSource).toContain("partialMonthStart");
  expect(chartCss).toContain("grid-template-columns: repeat(12, minmax(0, 1fr))");
  expect(chartCss).not.toMatch(/overflow-x\s*:\s*auto/i);
  expect(chartCss).not.toMatch(/min-width\s*:\s*3\.[0-9]+rem/i);
});
