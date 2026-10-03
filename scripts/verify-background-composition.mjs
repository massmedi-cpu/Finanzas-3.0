import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const layout = read("app/layout.tsx");
const background = read("app/app-background.css");
const inicio = read("app/inicio-overview.module.css");

function fail(message) {
  console.error(`❌ ART-008 background guard: ${message}`);
  process.exitCode = 1;
}

const cssImports = [...layout.matchAll(/import\s+["'](\.\/[^"']+\.css)["'];/g)].map((match) => match[1]);
if (cssImports.at(-1) !== "./app-background.css") {
  fail("app-background.css debe ser la última hoja global importada por RootLayout");
}

const tokenMatches = background.match(/--gradient-app-canvas\s*:/g) ?? [];
if (tokenMatches.length !== 1) {
  fail("--gradient-app-canvas debe tener exactamente una definición canónica");
}
if (!/body\s*\{[\s\S]*?background:\s*var\(--gradient-app-canvas\);[\s\S]*?background-attachment:\s*fixed,\s*fixed,\s*fixed;[\s\S]*?\}/.test(background)) {
  fail("body debe consumir el fondo canónico con tres capas fijas en escritorio");
}
if (!/@media\s*\(max-width:\s*48rem\)[\s\S]*?background-attachment:\s*scroll,\s*scroll,\s*scroll;/.test(background)) {
  fail("móvil debe desplazar las tres capas y evitar background-attachment fixed");
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?background-attachment:\s*scroll,\s*scroll,\s*scroll;/.test(background)) {
  fail("reduced-motion debe desplazar las tres capas del fondo");
}
if (!/\[data-app-shell="shared"\][\s\S]*?#main-content[\s\S]*?#main-content\s*>\s*\*[\s\S]*?background-color:\s*transparent;/.test(background)) {
  fail("AppShell, main-content y la raíz real de cada página deben conservar el lienzo global transparente");
}
if ((background.match(/radial-gradient\(/g) ?? []).length !== 2) {
  fail("el lienzo canónico debe tener exactamente dos luces radiales");
}
if ((background.match(/linear-gradient\(/g) ?? []).length !== 1) {
  fail("el lienzo canónico debe tener exactamente una base lineal");
}
if (/repeating-(?:linear|radial)-gradient\(/.test(background)) {
  fail("el fondo ambiental no debe recuperar rejillas o patrones repetitivos");
}
if (/rgba\(210,\s*174,\s*102/.test(background)) {
  fail("el dorado queda reservado a acentos y no al lienzo ambiental");
}

const shellBlock = inicio.match(/\.shell\s*\{([\s\S]*?)\}/)?.[1] ?? "";
if (!shellBlock) {
  fail("no se encontró el shell de Inicio");
} else if (/\bbackground(?:-image|-color)?\s*:/.test(shellBlock)) {
  fail("Inicio no debe declarar un segundo fondo de página en .shell");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("✅ ART-008 background composition guard: OK");
console.log("- app-background.css gobierna la última capa global");
console.log("- 2 luces radiales + 1 base lineal; sin rejilla ni dorado ambiental");
console.log("- 3 capas: fixed en escritorio, scroll en móvil y reduced-motion");
console.log("- AppShell, main-content e Inicio permanecen transparentes como página");
