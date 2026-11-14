import fs from "node:fs";

const home = fs.readFileSync("app/inicio-overview.tsx", "utf8");
const route = fs.readFileSync("app/api/dashboard/route.ts", "utf8");

// The API supports extra purpose-specific scopes as the product evolves.
// Protect the full set of explicitly supported scopes instead of pinning a
// fragment of the declaration's source formatting or an obsolete prefix.
const declaration = route.match(/const SCOPES = new Set\(\s*\[([\s\S]*?)\]\s*as const\s*\)/);
const declaredScopes = [...(declaration?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const expectedScopes = ["critical", "activity", "primary", "secondary", "alerts", "all"];
const scopesAreValid = declaredScopes.length === expectedScopes.length
  && new Set(declaredScopes).size === expectedScopes.length
  && expectedScopes.every((scope) => declaredScopes.includes(scope));

const assertions = [
  [scopesAreValid, "dashboard API exposes backward-compatible critical/activity scopes plus alerts"],
  [route.includes('if (scope === "critical") return [financial];'), "critical scope requests only financial snapshot"],
  [route.includes('if (scope === "activity") return [transactions];'), "activity scope requests only transactions"],
  [home.includes('loadScope("critical", ["financial"], generation)') && home.includes('isFresh(generation)'), "Inicio requests critical financial scope"],
  [home.includes('loadScope("activity", ["transactions"], generation)') && home.includes('generationRef.current'), "Inicio requests activity independently"],
  [home.includes('setActivityLoading(false)'), "activity has an independent loading lifecycle"],
  [home.includes('setAnalysisLoading(false)'), "analysis has an independent loading lifecycle"],
  [home.includes('aria-busy={primaryLoading || activityLoading || secondaryLoading || analysisLoading}'), "busy state covers all progressive scopes including Analysis"],
  [!home.includes('await loadScope("primary", ["financial", "transactions"])'), "Inicio no longer blocks financial data on transactions"],
];
for (const [ok, label] of assertions) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (assertions.some(([ok]) => !ok)) process.exit(1);
