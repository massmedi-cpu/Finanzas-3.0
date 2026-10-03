import fs from "node:fs";

const home = fs.readFileSync("app/inicio-overview.tsx", "utf8");
const route = fs.readFileSync("app/api/dashboard/route.ts", "utf8");
const assertions = [
  [route.includes('"critical", "activity", "primary", "secondary", "all"'), "dashboard API exposes backward-compatible critical/activity scopes"],
  [route.includes('if (scope === "critical") return [financial];'), "critical scope requests only financial snapshot"],
  [route.includes('if (scope === "activity") return [transactions];'), "activity scope requests only transactions"],
  [home.includes('loadScope("critical", ["financial"])'), "Inicio requests critical financial scope"],
  [home.includes('loadScope("activity", ["transactions"])'), "Inicio requests activity independently"],
  [home.includes('setActivityLoading(false)'), "activity has an independent loading lifecycle"],
  [home.includes('aria-busy={primaryLoading || activityLoading || secondaryLoading}'), "busy state covers all progressive scopes"],
  [!home.includes('await loadScope("primary", ["financial", "transactions"])'), "Inicio no longer blocks financial data on transactions"],
];
for (const [ok, label] of assertions) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (assertions.some(([ok]) => !ok)) process.exit(1);
