import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const protocol = readFileSync(
  "docs/commercial-readiness/cr006-human-beta-accessibility-protocol.md",
  "utf8",
);
const matrix = readFileSync(
  "docs/commercial-readiness/cr006-human-beta-matrix.md",
  "utf8",
);
const axiomGate = readFileSync("tests/e2e/axiom-final-gates.spec.ts", "utf8");
const transactionAccessibility = readFileSync("tests/e2e/transactions-accessibility.spec.ts", "utf8");
const budgetAccessibility = readFileSync("tests/e2e/budgets-accessibility.spec.ts", "utf8");
const forecastAccessibility = readFileSync("tests/e2e/forecast-accessibility.spec.ts", "utf8");
const reflowAccessibility = readFileSync("tests/e2e/cr006-reflow-forced-colors.spec.ts", "utf8");

test("CR-006 · el gate humano permanece pendiente hasta disponer de evidencia real", () => {
  expect(protocol).toContain("Estado: **PENDIENTE DE EVIDENCIA HUMANA**");
  expect(protocol).toContain("CR-006 no puede declararse completado sólo porque compile");
  expect(protocol).toContain("**PENDIENTE DE BETA HUMANA**");
  expect(protocol).toContain("**VALIDACIÓN DEL PROPIETARIO**");
  expect(protocol).toContain("Un test automático verde **NO CIERRA UNA INCIDENCIA HUMANA**");
  expect(matrix).toContain("Estado global: **PENDIENTE DE BETA HUMANA**");
  expect(matrix).toContain("CR-006: **BETA NO CERRABLE POR COBERTURA HUMANA INCOMPLETA**");
});

test("CR-006 · el protocolo prohíbe testers y métricas humanas simuladas", () => {
  for (const requirement of [
    "perfiles ficticios",
    "personas simuladas por IA",
    "tiempos inventados",
    "satisfacción inventada",
    "PRUEBA TÉCNICA / HEURÍSTICA / AUTOMATIZADA",
  ]) {
    expect(protocol).toContain(requirement);
  }
});

test("CR-006 · el protocolo exige B01–B08 y H01–H08 reales", () => {
  for (const profile of ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"]) {
    expect(protocol).toContain(profile);
    expect(matrix).toContain(profile);
  }

  for (const flow of ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"]) {
    expect(protocol).toContain(flow);
    expect(matrix).toContain(flow);
  }

  expect(protocol).toContain("mínimo recomendado de **8 personas reales**");
});

test("CR-006 · la accesibilidad humana no puede cerrarse con automatización", () => {
  for (const requirement of [
    "A01 · Teclado",
    "A02 · Bypass",
    "A03 · Zoom 200 %",
    "A04 · Reflow / 400 %",
    "A05 · Contraste / forced colors",
    "A06 · Lector de pantalla",
    "PENDIENTE DE EVIDENCIA HUMANA DE LECTOR DE PANTALLA",
  ]) {
    expect(protocol).toContain(requirement);
  }

  expect(matrix).toContain("PENDIENTE DE EVIDENCIA HUMANA DE LECTOR DE PANTALLA");
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
  expect(protocol).toContain("Los testers externos utilizarán exclusivamente datos ficticios");
  expect(protocol).toContain("Nunca se proporcionarán a terceros datos bancarios reales");
  expect(protocol).toContain("tokens, secretos");
});

test("CR-006 · BLOCKER y MAJOR impiden el cierre y requieren retest humano", () => {
  expect(protocol).toContain("CR-006 no puede cerrarse con BLOCKER abierto");
  expect(protocol).toContain("CR-006 no puede cerrarse con MAJOR abierto");
  expect(protocol).toContain("PENDIENTE DE RETEST");
  expect(protocol).toContain("RETEST HUMANO");
  expect(matrix).toContain("CR006-BETA-XXX");
});

test("CR-006 · CR-008 permanece bloqueada hasta el cierre formal", () => {
  expect(protocol).toContain("CR-008 NO PUEDE COMENZAR MIENTRAS CR-006 NO FIGURE FORMALMENTE COMO COMPLETADA");
  expect(matrix).toContain("CR-008: **BLOQUEADA**");
});

// Marcador deliberadamente inerte: fuerza la validación del Preview protegido sobre este SHA exacto.
