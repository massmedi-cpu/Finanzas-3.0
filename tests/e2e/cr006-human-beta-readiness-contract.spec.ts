import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const protocol = readFileSync(
  "docs/commercial-readiness/cr006-human-beta-accessibility-protocol.md",
  "utf8",
);
const axiomGate = readFileSync("tests/e2e/axiom-final-gates.spec.ts", "utf8");
const transactionAccessibility = readFileSync("tests/e2e/transactions-accessibility.spec.ts", "utf8");
const budgetAccessibility = readFileSync("tests/e2e/budgets-accessibility.spec.ts", "utf8");
const forecastAccessibility = readFileSync("tests/e2e/forecast-accessibility.spec.ts", "utf8");
const reflowAccessibility = readFileSync("tests/e2e/cr006-reflow-forced-colors.spec.ts", "utf8");

test("CR-006 · el gate humano permanece pendiente hasta disponer de evidencia real", () => {
  expect(protocol).toContain("Estado: **PENDIENTE DE EVIDENCIA HUMANA**");
  expect(protocol).toContain("CR-006 no puede declararse completado");
  expect(protocol).toContain("no se publicarán tiempos, tasas de éxito, satisfacción ni métricas humanas inventadas");
  expect(protocol).toContain("**Estado actual del gate humano: PENDIENTE.**");
});

test("CR-006 · el protocolo exige los recorridos humanos críticos de accesibilidad", () => {
  for (const requirement of [
    "Sólo teclado",
    "Lector de pantalla",
    "Zoom y reflow",
    "Alto contraste / forced colors",
    "Táctil",
    "no existan BLOCKER abiertos",
  ]) {
    expect(protocol).toContain(requirement);
  }

  for (const flow of ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"]) {
    expect(protocol).toContain(flow);
  }
});

test("CR-006 · la preparación automática cubre base global y flujos financieros críticos", () => {
  expect(axiomGate).toContain("todos los controles visibles deben tener nombre accesible");
  expect(axiomGate).toContain("los controles táctiles visibles deben medir al menos 44 px de alto");
  expect(axiomGate).toContain("la navegación por teclado debe mostrar focus visible");

  expect(transactionAccessibility).toContain('aria-invalid", "true"');
  expect(transactionAccessibility).toContain("44 px");
  expect(budgetAccessibility).toContain('role", "alert"');
  expect(budgetAccessibility).toContain("14 px");
  expect(forecastAccessibility).toContain("mueve foco al control inválido");
  expect(forecastAccessibility).toContain("gestiona el foco al abrir y cerrar candidatos reales");

  expect(reflowAccessibility).toContain("320 CSS px");
  expect(reflowAccessibility).toContain('forcedColors: "active"');
});

test("CR-006 · la beta protege datos financieros reales de terceros", () => {
  expect(protocol).toContain("No usar movimientos bancarios, documentos, tickets, credenciales ni datos financieros reales");
  expect(protocol).toContain("datos ficticios o fixtures controlados");
  expect(protocol).toContain("No compartir tokens, claves, enlaces de bypass ni secretos de infraestructura");
});

// Marcador deliberadamente inerte: fuerza la validación del Preview protegido sobre este SHA exacto.
