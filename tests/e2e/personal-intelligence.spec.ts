import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Inicio prioriza atención personal desde los motores canónicos y limita el ruido", () => {
  const overview = source("app/inicio-overview.tsx");

  expect(overview).toContain("const attentionItems = useMemo<AttentionItem[]>");
  expect(overview).toContain("if (syncFailed)");
  expect(overview).toContain("(financial?.period.operatingNetCents ?? 0) < 0");
  expect(overview).toContain("if (overBudgetCount > 0)");
  expect(overview).toContain("(data.forecast?.summary.projectedClosingBalanceCents ?? 0) < 0");
  expect(overview).toContain("return items.slice(0, 3)");
  expect(overview).toContain('href: "/analysis"');
  expect(overview).toContain('href: "/budgets"');
  expect(overview).toContain('href: "/forecast"');
  expect(overview).toContain('href: "/configuration/source"');
});

test("La inteligencia personal compara visitas equivalentes sin guardar detalles sensibles", () => {
  const brief = source("app/home-smart-brief.tsx");

  expect(brief).toContain("previousVisit.month === currentVisit.month");
  expect(brief).toContain("currentVisit.expenseCents - previousVisit.expenseCents");
  expect(brief).toContain("currentVisit.budgetProgressBps - previousVisit.budgetProgressBps");
  expect(brief).toContain("currentVisit.projectedNetCents - previousVisit.projectedNetCents");
  expect(brief).toContain("currentVisit.activeBalanceCents - previousVisit.activeBalanceCents");
  expect(brief).toContain("localStorage.setItem(HOME_VISIT_KEY, JSON.stringify(currentVisit))");
  expect(brief).not.toContain("merchantName");
  expect(brief).not.toContain("conceptOriginal");
  expect(brief).not.toContain("documentId");
});

test("La inteligencia personal es determinista y no introduce un segundo motor ni IA generativa", () => {
  const overview = source("app/inicio-overview.tsx");
  const brief = source("app/home-smart-brief.tsx");
  const combined = `${overview}\n${brief}`;

  expect(combined).not.toMatch(/openai|chatgpt|generative ai|llm/i);
  expect(brief).not.toContain("fetch(");
  expect(overview).toContain('/api/dashboard?scope=${scope}');
  expect(overview).toContain('loadScope("primary", ["financial", "transactions"])');
  expect(overview).toContain('loadScope("secondary", ["monthly", "budgets", "forecast"])');
});
