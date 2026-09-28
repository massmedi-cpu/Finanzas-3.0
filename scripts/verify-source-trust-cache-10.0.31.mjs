import fs from "node:fs";

const statusSource = fs.readFileSync("app/source-trust-status.tsx", "utf8");
const cacheSource = fs.readFileSync("app/source-trust-cache.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

function requireText(source, fragment, description) {
  if (!source.includes(fragment)) throw new Error(`Falta ${description}: ${fragment}`);
}

function versionAtLeast(current, minimum) {
  const currentParts = current.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  if (currentParts.length !== 3 || currentParts.some((value) => !Number.isInteger(value) || value < 0)) return false;
  if (minimumParts.length !== 3 || minimumParts.some((value) => !Number.isInteger(value) || value < 0)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] > minimumParts[index]) return true;
    if (currentParts[index] < minimumParts[index]) return false;
  }
  return true;
}

if (!versionAtLeast(pkg.version, "10.0.31")) {
  throw new Error(`package.json debe conservar source trust cache >=10.0.31, es ${pkg.version}`);
}
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  throw new Error("package-lock.json no coincide con package.json");
}

requireText(cacheSource, "SOURCE_TRUST_CACHE_TTL_MS = 20_000", "TTL corto de confianza estable");
requireText(cacheSource, "SOURCE_TRUST_TRANSIENT_TTL_MS = 2_500", "TTL corto para sincronización en curso");
requireText(cacheSource, "let cacheEntry: CacheEntry | null = null", "caché compartida solo en memoria");
requireText(cacheSource, "let inFlightRequest: Promise<SourceFreshness | null> | null = null", "deduplicación de petición activa");
requireText(cacheSource, "let generation = 0", "generación para invalidación segura");
requireText(cacheSource, "generation += 1", "invalidación de respuestas antiguas");
requireText(cacheSource, "cache: \"no-store\"", "red sin caché persistente");
requireText(cacheSource, "if (inFlightRequest) return inFlightRequest", "reutilización de petición en curso");
requireText(cacheSource, "if (requestGeneration !== generation) return null", "rechazo de respuesta obsoleta");
requireText(cacheSource, "cacheEntry = { payload, checkedAt: Date.now() }", "cacheo exclusivo de payload válido");
requireText(statusSource, "invalidateSourceTrustCache()", "invalidación explícita desde la UI");
requireText(statusSource, "pathname === \"/configuration/source\"", "invalidación al revisar/cambiar la fuente");
requireText(statusSource, "window.addEventListener(\"focus\", revalidateAfterFocus)", "revalidación al recuperar foco");
requireText(statusSource, "shouldRevalidateSourceTrust()", "revalidación condicionada por TTL");
requireText(statusSource, "getCachedSourceTrust()", "reutilización síncrona sin flash");
requireText(statusSource, "loadSourceTrustFreshness()", "carga compartida de confianza");

for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
  if (statusSource.includes(forbidden) || cacheSource.includes(forbidden)) {
    throw new Error(`La confianza de fuente no puede persistirse en ${forbidden}`);
  }
}

console.log(`Source Trust Cache 10.0.31+ contract: OK (${pkg.version})`);
