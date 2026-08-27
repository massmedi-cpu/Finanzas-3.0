import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const engineRoot = path.join(root, "public", "vendor", "document-engine");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const appVersionSource = await readFile(path.join(root, "lib", "app-version.ts"), "utf8");
const archive = await readFile(path.join(root, "app", "archivo", "archive-client.tsx"), "utf8");
const pdfLoader = await readFile(path.join(root, "public", "vendor", "pdfjs-loader.mjs"), "utf8");
const paddleLoader = await readFile(path.join(root, "public", "vendor", "paddleocr-loader.mjs"), "utf8");
const revision = await readFile(path.join(root, "lib", "document", "receipt-ocr-revision.ts"), "utf8");
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
function parseVersion(value) {
  const match=String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match?match.slice(1).map(Number):null;
}
function atLeast19(value) {
  const v=parseVersion(value);
  return Boolean(v && (v[0]>1 || (v[0]===1 && v[1]>=9)));
}

const appVersionMatch=appVersionSource.match(/APP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
const canonicalVersion=appVersionMatch?.[1]??null;
check(atLeast19(packageJson.version), "la garantía documental 1.9 requiere paquete técnico >= 1.9.0");
check(lockfile.version === packageJson.version && lockfile.packages?.[""]?.version === packageJson.version, "package-lock no está alineado con package.json");
check(atLeast19(canonicalVersion), "APP_VERSION debe ser una versión de producto válida >= 1.9.0");

// Los assets Tesseract/PDF.js de la garantía histórica 1.9 permanecen
// reproducibles y verificables, pero Tesseract ya no es un runtime permitido
// para tickets desde la revisión paddle_layout_v1.
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

for (const scriptName of ["postinstall", "predev", "prepare:document-engine"]) {
  check(packageJson.scripts?.[scriptName] === "node scripts/prepare-document-engine.mjs", `${scriptName} no prepara el motor documental histórico reproducible`);
}
const prebuildSteps=String(packageJson.scripts?.prebuild??"").split("&&").map((step)=>step.trim()).filter(Boolean);
check(prebuildSteps.at(-1) === "node scripts/prepare-document-engine.mjs", "prebuild no termina preparando el motor documental");
check(packageJson.scripts?.["audit:v19"] === "node scripts/audit-v19.mjs", "falta audit:v19");
check(gitignore.includes("public/vendor/document-engine/"), "los assets generados no están excluidos de Git");

const paddleRuntime = revision.includes("paddle_layout_v1");
if (paddleRuntime) {
  check(archive.includes("PaddleOCR.create"), "Archivo no usa PaddleOCR.js como runtime canónico");
  check(archive.includes('ocrVersion:"PP-OCRv5"') && archive.includes('lang:"es"'), "PP-OCRv5 no está fijado a español");
  check(!archive.includes("Tesseract"), "Archivo conserva Tesseract en runtime pese a paddle_layout_v1");
  check(paddleLoader.includes("@paddleocr/paddleocr-js@0.4.2"), "PaddleOCR.js no está fijado a 0.4.2");
  check(archive.includes("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"), "ORT WASM no está fijado a la versión auditada");
  check(!archive.includes("unpkg.com")&&!archive.includes("tessdata.projectnaptha.com"), "Archivo referencia un CDN OCR no permitido");
} else {
  for (const forbidden of ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com"]) {
    check(!archive.includes(forbidden), `Archivo todavía referencia ${forbidden}`);
  }
  for (const required of [
    '/vendor/document-engine/tesseract/tesseract.min.js',
    '/vendor/document-engine/tesseract/worker.min.js',
    '/vendor/document-engine/tesseract-core',
    '/vendor/document-engine/tessdata',
  ]) check(archive.includes(required), `falta ruta first-party ${required}`);
}
for (const forbidden of ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com"]) check(!pdfLoader.includes(forbidden), `PDF loader todavía referencia ${forbidden}`);
check(pdfLoader.includes('/vendor/document-engine/pdfjs/pdf.min.mjs'), "PDF.js principal no es first-party");
check(pdfLoader.includes('/vendor/document-engine/pdfjs/pdf.worker.min.mjs'), "worker PDF.js no es first-party");
check(archive.includes("localProcessing:true"), "se perdió la garantía de OCR local");

check(manifest.formatVersion === 1 && manifest.generatedFromLockfile === true, "manifest del motor documental histórico inválido");
check(manifest.appVersion === canonicalVersion, "manifest documental generado para otra versión de producto");
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
  check(manifest.assets.some((asset) => asset.path === relative), `falta ${relative} en manifest histórico`);
}

const coreFiles = (await readdir(path.join(engineRoot, "tesseract-core"))).filter((name) => name.endsWith(".wasm.js"));
check(coreFiles.length >= 4, "faltan variantes históricas de Tesseract core para reproducibilidad");

for (const asset of manifest.assets) {
  const file = path.join(engineRoot, asset.path);
  const info = await stat(file);
  check(info.size === asset.bytes && info.size > 0, `tamaño inválido en ${asset.path}`);
  check(await sha256(file) === asset.sha256, `hash SHA-256 no coincide en ${asset.path}`);
}

console.log(`AUDIT 1.9 OK · producto ${canonicalVersion} · assets históricos verificables · runtime ${paddleRuntime?"PP-OCRv5":"1.9"}`);
