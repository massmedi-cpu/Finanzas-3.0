import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const contract = read("src/domain/product-scope-contract.ts");
const navigation = read("app/navigation-items.ts");
const scopeTest = read("tests/e2e/net-worth-scope-contract.spec.ts");

const fail = (message) => { throw new Error(message); };
const requireText = (text, token, label) => {
  if (!text.includes(token)) fail(`${label}: falta ${token}`);
};

if (pkg.version !== "10.0.102") fail(`version esperada 10.0.102, recibida ${pkg.version}`);
requireText(contract, 'status: "out_of_scope_current_release"', "PRE-019 · estado");
requireText(contract, 'decision: "do_not_implement"', "PRE-019 · decisión");
requireText(contract, 'netWorth: "not_available"', "PRE-019 · significado");
requireText(contract, '"infer_assets_or_liabilities_from_account_type_only"', "PRE-019 · atajo prohibido");

if (navigation.includes("/net-worth") || navigation.includes("Patrimonio")) {
  fail("PRE-019 · la navegación vuelve a exponer Patrimonio");
}

for (const path of [
  "app/net-worth/page.tsx",
  "app/net-worth/net-worth-client.tsx",
  "app/net-worth/net-worth.module.css",
  "src/application/net-worth/net-worth.ts",
  "tests/e2e/net-worth-10.0.53.spec.ts",
]) {
  if (fs.existsSync(path)) fail(`PRE-019 · implementación fuera de alcance presente: ${path}`);
}

requireText(scopeTest, "10.0.102 · PRE-019 no expone una implementación patrimonial fuera de alcance", "PRE-019 · regresión");

console.log("Financial App 10.0.102 · PRE-019 fuera de alcance: OK");
