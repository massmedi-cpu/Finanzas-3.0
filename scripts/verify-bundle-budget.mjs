import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), ".next", "static", "chunks");
const maxTotalBytes = Number(process.env.FINANCIAL_APP_MAX_CLIENT_JS_BYTES ?? 15_000_000);
const maxChunkBytes = Number(process.env.FINANCIAL_APP_MAX_CLIENT_CHUNK_BYTES ?? 2_000_000);

function collectJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(absolute);
    return entry.isFile() && entry.name.endsWith(".js") ? [absolute] : [];
  });
}

const files = collectJavaScript(root).map((path) => ({
  path,
  bytes: statSync(path).size,
}));

if (!files.length) {
  console.error("PRE-037 · no se encontraron chunks JavaScript de cliente tras el build.");
  process.exit(1);
}

const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const largest = files.reduce((current, file) => file.bytes > current.bytes ? file : current, files[0]);
const formatMb = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;

console.log(`PRE-037 · chunks cliente: ${files.length}`);
console.log(`PRE-037 · JS cliente total: ${formatMb(totalBytes)} / ${formatMb(maxTotalBytes)}`);
console.log(`PRE-037 · chunk mayor: ${relative(process.cwd(), largest.path)} = ${formatMb(largest.bytes)} / ${formatMb(maxChunkBytes)}`);

const failures = [];
if (totalBytes > maxTotalBytes) failures.push(`JS total ${formatMb(totalBytes)} supera ${formatMb(maxTotalBytes)}`);
if (largest.bytes > maxChunkBytes) failures.push(`chunk mayor ${formatMb(largest.bytes)} supera ${formatMb(maxChunkBytes)}`);

if (failures.length) {
  console.error("PRE-037 · presupuesto de rendimiento incumplido:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PRE-037 · presupuesto de bundle: OK");
