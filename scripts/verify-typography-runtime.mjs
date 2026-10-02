import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const globalsPath = path.join(root, "app", "globals.css");
const globals = fs.readFileSync(globalsPath, "utf8");
const expectedStack = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function fail(message) {
  console.error(`❌ ART-007 typography guard: ${message}`);
  process.exitCode = 1;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return [target];
  });
}

if (!globals.includes(`--font-family-ui: ${expectedStack};`)) {
  fail("--font-family-ui debe declarar exactamente la pila system-ui canónica");
}
if (!/body\s*\{[\s\S]*?font-family:\s*var\(--font-family-ui\);/.test(globals)) {
  fail("body debe consumir var(--font-family-ui)");
}
if (!/button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit;\s*\}/.test(globals)) {
  fail("los controles de formulario deben heredar la tipografía efectiva");
}
if (/\bInter\b/.test(globals)) {
  fail("globals.css no debe prometer Inter sin una fuente gobernada");
}

const appFiles = walk(path.join(root, "app"));
for (const file of appFiles) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  if (!/\.(?:css|ts|tsx)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");

  if (/from\s+["']next\/font\//.test(source)) {
    fail(`${relative} introduce next/font fuera del contrato system-ui`);
  }
  if (/^\s*@font-face\b/m.test(source)) {
    fail(`${relative} introduce @font-face fuera del contrato system-ui`);
  }
  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(source)) {
    fail(`${relative} introduce una dependencia tipográfica remota`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log("✅ ART-007 typography runtime guard: OK");
console.log(`- pila UI: ${expectedStack}`);
console.log("- body gobernado por --font-family-ui");
console.log("- controles heredan la misma métrica");
console.log("- sin Inter implícita, next/font, @font-face ni fuentes remotas no gobernadas");
