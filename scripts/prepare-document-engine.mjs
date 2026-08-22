import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nodeModules = path.join(root, "node_modules");
const targetRoot = path.join(root, "public", "vendor", "document-engine");
const manifestPath = path.join(targetRoot, "manifest.json");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));

function lockedVersion(name) {
  return lockfile.packages?.[`node_modules/${name}`]?.version ?? packageJson.dependencies?.[name] ?? null;
}

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

const assets = [];
async function copyTracked(source, relativeTarget) {
  const destination = path.join(targetRoot, relativeTarget);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const info = await stat(destination);
  assets.push({
    path: relativeTarget.replaceAll(path.sep, "/"),
    bytes: info.size,
    sha256: await sha256(destination),
  });
}

await copyTracked(
  path.join(nodeModules, "tesseract.js", "dist", "tesseract.min.js"),
  path.join("tesseract", "tesseract.min.js"),
);
await copyTracked(
  path.join(nodeModules, "tesseract.js", "dist", "worker.min.js"),
  path.join("tesseract", "worker.min.js"),
);
await copyTracked(
  path.join(nodeModules, "pdfjs-dist", "build", "pdf.min.mjs"),
  path.join("pdfjs", "pdf.min.mjs"),
);
await copyTracked(
  path.join(nodeModules, "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join("pdfjs", "pdf.worker.min.mjs"),
);
await copyTracked(
  path.join(nodeModules, "@tesseract.js-data", "spa", "4.0.0", "spa.traineddata.gz"),
  path.join("tessdata", "spa.traineddata.gz"),
);

const coreSource = path.join(nodeModules, "tesseract.js-core");
const coreFiles = (await readdir(coreSource))
  .filter((name) => name.startsWith("tesseract-core") && name.endsWith(".wasm.js"))
  .sort();

if (coreFiles.length < 4) {
  throw new Error(`Tesseract core incompleto: ${coreFiles.length} variantes .wasm.js encontradas`);
}

for (const file of coreFiles) {
  await copyTracked(path.join(coreSource, file), path.join("tesseract-core", file));
}

const manifest = {
  formatVersion: 1,
  appVersion: packageJson.version,
  generatedFromLockfile: true,
  packages: {
    "tesseract.js": lockedVersion("tesseract.js"),
    "tesseract.js-core": lockedVersion("tesseract.js-core"),
    "@tesseract.js-data/spa": lockedVersion("@tesseract.js-data/spa"),
    "pdfjs-dist": lockedVersion("pdfjs-dist"),
  },
  assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Motor documental preparado · ${manifest.assets.length} assets · Financial App ${manifest.appVersion}`);
