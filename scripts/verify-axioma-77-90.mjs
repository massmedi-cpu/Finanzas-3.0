import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
const requireMatch = (path, pattern, label) => {
  const content = read(path);
  if (!pattern.test(content)) failures.push(`${label} (${path})`);
};
const requireAbsent = (path, pattern, label) => {
  const content = read(path);
  if (pattern.test(content)) failures.push(`${label} (${path})`);
};

requireMatch("app/app-shell.module.css", /safe-area-inset-bottom/, "safe-area móvil");
requireMatch("app/app-shell.module.css", /prefers-reduced-motion:\s*reduce/, "reduced motion");
requireMatch("app/source-trust-status.tsx", /role="status"[\s\S]*aria-live="polite"/, "estado dinámico accesible");
requireMatch("app/app-shell.tsx", /data-testid="offline-status"[\s\S]*aria-live="polite"|aria-live="polite"[\s\S]*data-testid="offline-status"/, "indicador offline accesible");
requireMatch("app/pwa-runtime.tsx", /financial-app-safe-refresh-v1/, "tag Background Sync");
requireMatch("app/pwa-runtime.tsx", /syncManager\.register\(SAFE_REFRESH_SYNC_TAG\)/, "registro Background Sync");
requireMatch("public/sw.js", /addEventListener\("sync"/, "listener Background Sync");
requireMatch("public/sw.js", /method:\s*"GET"/, "revalidación solo GET");
requireMatch("public/sw.js", /cache:\s*"no-store"/, "revalidación sin caché privado");
requireAbsent("public/sw.js", /caches\.(open|match|put)|cache\.put\(/, "el SW no debe persistir respuestas financieras");
requireAbsent("public/sw.js", /method:\s*"(POST|PUT|PATCH|DELETE)"/, "el SW no debe reintentar mutaciones");
requireMatch("app/source-trust-cache.ts", /let lastSafeSnapshot: SafeSourceTrustSnapshot \| null = null/, "snapshot seguro efímero");
requireMatch("app/source-trust-cache.ts", /if \(payload\.available\) lastSafeSnapshot = cacheEntry/, "última confianza segura solo tras payload válido");
requireAbsent("app/source-trust-cache.ts", /localStorage|sessionStorage|indexedDB/, "la confianza de fuente no debe persistirse en almacenamiento local");
requireAbsent("app/source-trust-cache.ts", /\b(amount|importe|concept|accountNumber|iban)\b/i, "el snapshot no debe contener datos financieros de detalle");
requireMatch("app/loading.tsx", /export default/, "estado de carga estructural");
requireAbsent("app/layout.tsx", /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, "zoom no bloqueado");
requireMatch(".github/workflows/navigation-performance.yml", /Production build[\s\S]*npm run build/, "build en gate de navegación");
requireMatch(".github/workflows/navigation-performance.yml", /chromium-desktop[\s\S]*chromium-mobile/, "navegación desktop y móvil");

if (failures.length) {
  console.error("PRE-036 · incumplimientos Axioma §§77–90:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PRE-036 · contrato Axioma §§77–90: OK");
console.log("Seguridad: solo lectura, sin replay de mutaciones, sin Cache Storage bancario y sin persistencia local de confianza.");
