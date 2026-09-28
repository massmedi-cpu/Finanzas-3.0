import fs from "node:fs";

const source = fs.readFileSync("app/source-trust-status.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

function requireText(fragment, description) {
  if (!source.includes(fragment)) throw new Error(`Falta ${description}: ${fragment}`);
}

if (pkg.version !== "10.0.31") throw new Error(`package.json debe ser 10.0.31, es ${pkg.version}`);
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  throw new Error("package-lock.json no coincide con package.json");
}

requireText("SOURCE_TRUST_CACHE_TTL_MS = 20_000", "TTL corto de confianza estable");
requireText("SOURCE_TRUST_TRANSIENT_TTL_MS = 2_500", "TTL corto para sincronización en curso");
requireText("cacheRef = useRef<SourceTrustCacheEntry | null>(null)", "caché solo en memoria");
requireText("cache: \"no-store\"", "red sin caché persistente");
requireText("cacheRef.current = null", "invalidación explícita");
requireText("pathname === \"/configuration/source\"", "invalidación al revisar/cambiar la fuente");
requireText("window.addEventListener(\"focus\", revalidateAfterFocus)", "revalidación al recuperar foco");
requireText("Date.now() - cached.checkedAt < cacheTtl(cached.payload)", "reutilización solo dentro del TTL");
requireText("cacheRef.current = { payload, checkedAt: Date.now() }", "cacheo exclusivo de payload válido");
requireText("cacheRef.current = null;\n        setState({ kind: \"unknown\" })", "fallos no cacheados");

for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
  if (source.includes(forbidden)) throw new Error(`La confianza de fuente no puede persistirse en ${forbidden}`);
}

console.log("Source Trust Cache 10.0.31 contract: OK");
