import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const engineRoot = path.join(root, "public", "vendor", "document-engine");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const appVersion = await readFile(path.join(root, "lib", "app-version.ts"), "utf8");
const archive = await readFile(path.join(root, "app", "archivo", "archive-client.tsx"), "utf8");
const pdfLoader = await readFile(path.join(root, "public", "vendor", "pdfjs-loader.mjs"), "utf8");
const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
const manifest = JSON.parse(await readFile(path.join(engineRoot, "manifest.json"), "utf8"));

function check(condition, message) {
  if (!condition) throw new Error(`AUDIT 1.9 · ${message}`);
}
function lockedVersion(name) {
  return lockfile.packages?.[`node_modules/${name}`]?.version ?? null;
}
async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

check(packageJson.version === "1.9.0", "package.json no está en 1.9.0");
check(lockfile.version === "1.9.0" && lockfile.packages?.[""]?.version === "1.9.0", "package-lock no está alineado con 1.9.0");
check(appVersion.includes('APP_VERSION = "1.9.0"'), "APP_VERSION no está en 1.9.0");

const expected = {
  "tesseract.js": "7.0.0",
  "pdfjs-dist": "6.2.108",
  "@tesseract.js-data/spa": "1.0.0",
};
for (const [name, version] of Object.entries(expected)) {
  check(packageJson.dependencies?.[name] === version, `${name} no está fijado a ${version}`);
  check(lockedVersion(name) === version, `${name} no coincide en package-lock`);
}
check(Boolean(lockedVersion("tesseract.js-core")), "tesseract.js-core no está resuelto en package-lock");

for (const scriptName of ["postinstall", "predev", "prebuild", "prepare:document-engine"]) {
  check(packageJson.scripts?.[scriptName] === "node scripts/prepare-document-engine.mjs", `${scriptName} no prepara el motor documental`);
}
check(packageJson.scripts?.["audit:v19"] === "node scripts/audit-v19.mjs", "falta audit:v19");
check(gitignore.includes("public/vendor/document-engine/"), "los assets generados no están excluidos de Git");

for (const forbidden of ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com"]) {
  check(!archive.includes(forbidden), `Archivo todavía referencia ${forbidden}`);
  check(!pdfLoader.includes(forbidden), `PDF loader todavía referencia ${forbidden}`);
}

for (const required of [
  '/vendor/document-engine/tesseract/tesseract.min.js',
  '/vendor/document-engine/tesseract/worker.min.js',
  '/vendor/document-engine/tesseract-core',
  '/vendor/document-engine/tessdata',
]) check(archive.includes(required), `falta ruta first-party ${required}`);
check(pdfLoader.includes('/vendor/document-engine/pdfjs/pdf.min.mjs'), "PDF.js principal no es first-party");
check(pdfLoader.includes('/vendor/document-engine/pdfjs/pdf.worker.min.mjs'), "worker PDF.js no es first-party");
check(archive.includes("localProcessing:true"), "se perdió la garantía de OCR local");

check(manifest.formatVersion === 1 && manifest.generatedFromLockfile === true, "manifest del motor documental inválido");
check(manifest.appVersion === "1.9.0", "manifest generado para otra versión");
for (const name of ["tesseract.js", "tesseract.js-core", "@tesseract.js-data/spa", "pdfjs-dist"]) {
  check(manifest.packages?.[name] === lockedVersion(name), `manifest no coincide con lockfile para ${name}`);
}

const requiredAssets = [
  "tesseract/tesseract.min.js",
  "tesseract/worker.min.js",
  "pdfjs/pdf.min.mjs",
  "pdfjs/pdf.worker.min.mjs",
  "tessdata/spa.traineddata.gz",
];
for (const relative of requiredAssets) {
  check(manifest.assets.some((asset) => asset.path === relative), `falta ${relative} en manifest`);
}

const coreFiles = (await readdir(path.join(engineRoot, "tesseract-core"))).filter((name) => name.endsWith(".wasm.js"));
check(coreFiles.length >= 4, "faltan variantes de Tesseract core para compatibilidad de dispositivos");

for (const asset of manifest.assets) {
  const file = path.join(engineRoot, asset.path);
  const info = await stat(file);
  check(info.size === asset.bytes && info.size > 0, `tamaño inválido en ${asset.path}`);
  check(await sha256(file) === asset.sha256, `hash SHA-256 no coincide en ${asset.path}`);
}

console.log(`AUDIT 1.9 OK · motor documental first-party · ${manifest.assets.length} assets verificados`);
