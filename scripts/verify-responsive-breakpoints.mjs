import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => readFileSync(resolve(root, path), "utf8");

const SYSTEM_BREAKPOINTS_PX = new Set([360, 480, 768, 1024, 1280, 1440, 1728]);
const LEGACY_CONTENT_BREAKPOINTS_PX = new Set([420, 600, 680, 900, 1050, 1180]);
const CSS_SEMANTIC_TRANSITIONS_PX = new Set([768.16]); // 48.01rem: evita solapar max-width: 48rem.
const documentationPath = "docs/precommercial-audit/07d-responsive-breakpoints-10.0.56.md";
const documentation = read(documentationPath);

const cssFiles = [];
function collectCssFiles(directory) {
  const absolute = resolve(root, directory);
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) collectCssFiles(relative(root, path));
    else if (extname(entry) === ".css") cssFiles.push(relative(root, path).replaceAll("\\", "/"));
  }
}

collectCssFiles("app");
collectCssFiles("src");

const occurrences = [];
const unknown = [];
const mediaPattern = /@media\s*([^\{]+)\{/gim;
const widthPatterns = [
  /\b(?:min-|max-)?width\s*:\s*(\d+(?:\.\d+)?)\s*(px|rem)\b/gim,
  /\bwidth\s*(?:<=|>=|<|>)\s*(\d+(?:\.\d+)?)\s*(px|rem)\b/gim,
];

for (const path of cssFiles) {
  const css = read(path);
  for (const mediaMatch of css.matchAll(mediaPattern)) {
    const query = mediaMatch[1].trim().replace(/\s+/g, " ");
    for (const pattern of widthPatterns) {
      for (const match of query.matchAll(pattern)) {
        const numeric = Number(match[1]);
        const unit = match[2].toLowerCase();
        const px = unit === "rem" ? Number((numeric * 16).toFixed(2)) : numeric;
        const kind = SYSTEM_BREAKPOINTS_PX.has(px)
          ? "system"
          : CSS_SEMANTIC_TRANSITIONS_PX.has(px)
            ? "semantic-transition"
            : LEGACY_CONTENT_BREAKPOINTS_PX.has(px)
              ? "documented-content-exception"
              : "unknown";
        const item = { path, query, raw: `${numeric}${unit}`, px, kind };
        occurrences.push(item);
        if (kind === "unknown") unknown.push(item);
      }
    }
  }
}

for (const value of SYSTEM_BREAKPOINTS_PX) {
  assert(documentation.includes(`${value}px`), `La documentación ART-003 debe declarar el breakpoint de sistema ${value}px.`);
}
for (const value of LEGACY_CONTENT_BREAKPOINTS_PX) {
  assert(documentation.includes(`${value}px`), `La documentación ART-003 debe justificar la excepción de contenido ${value}px.`);
}

const shell = read("app/app-shell.module.css");
for (const query of [
  "@media (max-width: 90rem) and (min-width: 48.01rem)",
  "@media (max-width: 48rem)",
  "@media (max-width: 30rem)",
]) {
  assert(shell.includes(query), `El AppShell debe conservar la transición semántica: ${query}.`);
}

const contract = read("src/design/responsive-breakpoints.ts");
for (const [name, value] of [
  ["compactPhone", 360],
  ["compact", 480],
  ["mobileMax", 768],
  ["content", 1024],
  ["dense", 1280],
  ["wide", 1440],
  ["ultraWide", 1728],
]) {
  assert(contract.includes(`${name}: ${value}`), `Falta ${name}: ${value} en el contrato responsive.`);
}

if (unknown.length) {
  for (const item of unknown) {
    failures.push(`${item.path}: breakpoint no gobernado ${item.raw} (~${item.px}px) en @media ${item.query}`);
  }
}

if (failures.length) {
  console.error("Responsive breakpoint guard: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error("Añade el valor al sistema sólo si es reusable; si es una excepción real de contenido, documéntala explícitamente antes de permitirla.");
  process.exit(1);
}

const unique = [...new Map(occurrences.map((item) => [`${item.raw}:${item.kind}`, item])).values()]
  .sort((a, b) => a.px - b.px || a.raw.localeCompare(b.raw));

console.log("Responsive breakpoint guard: OK");
console.log(`- CSS inspeccionados: ${cssFiles.length}`);
console.log(`- usos de viewport inspeccionados: ${occurrences.length}`);
console.log(`- breakpoints de sistema: ${[...SYSTEM_BREAKPOINTS_PX].join(", ")}px`);
console.log(`- excepciones de contenido heredadas y documentadas: ${[...LEGACY_CONTENT_BREAKPOINTS_PX].join(", ")}px`);
for (const item of unique) console.log(`- ${item.raw} -> ${item.kind}`);
