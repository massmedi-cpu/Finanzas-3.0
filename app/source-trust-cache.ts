export type SyncStatus = "success" | "partial" | "failed" | "started";

export type SourceFreshness = {
  available: boolean;
  latestMovementDate: string | null;
  sync: null | {
    status: SyncStatus;
    finishedAt: string | null;
    startedAt: string | null;
    rowsSeen: number | null;
    rowsFailed: number | null;
    rowsMissing: number | null;
    duplicatesDetected: number | null;
    warningsCount: number | null;
  };
};

export type SafeSourceTrustSnapshot = {
  payload: SourceFreshness;
  checkedAt: number;
};

type CacheEntry = SafeSourceTrustSnapshot;

const SOURCE_TRUST_CACHE_TTL_MS = 20_000;
const SOURCE_TRUST_TRANSIENT_TTL_MS = 2_500;
const SAFE_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const SAFE_SNAPSHOT_STORAGE_KEY = "financial-app:source-trust-safe-v1";

let cacheEntry: CacheEntry | null = null;
let inFlightRequest: Promise<SourceFreshness | null> | null = null;
let generation = 0;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function isSourceFreshness(value: unknown): value is SourceFreshness {
  if (!record(value) || typeof value.available !== "boolean") return false;
  if (!nullableString(value.latestMovementDate)) return false;
  if (value.sync === null) return true;
  if (!record(value.sync)) return false;

  const statusValid = value.sync.status === "success"
    || value.sync.status === "partial"
    || value.sync.status === "failed"
    || value.sync.status === "started";

  return statusValid
    && nullableString(value.sync.finishedAt)
    && nullableString(value.sync.startedAt)
    && nullableFiniteNumber(value.sync.rowsSeen)
    && nullableFiniteNumber(value.sync.rowsFailed)
    && nullableFiniteNumber(value.sync.rowsMissing)
    && nullableFiniteNumber(value.sync.duplicatesDetected)
    && nullableFiniteNumber(value.sync.warningsCount);
}

function cacheTtl(payload: SourceFreshness) {
  return payload.sync?.status === "started"
    ? SOURCE_TRUST_TRANSIENT_TTL_MS
    : SOURCE_TRUST_CACHE_TTL_MS;
}

function readPersistedSnapshot(): SafeSourceTrustSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAFE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || typeof parsed.checkedAt !== "number" || !Number.isFinite(parsed.checkedAt)) return null;
    if (!isSourceFreshness(parsed.payload)) return null;
    return { payload: parsed.payload, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

function persistSafeSnapshot(snapshot: SafeSourceTrustSnapshot) {
  if (typeof window === "undefined" || !snapshot.payload.available) return;
  try {
    // Solo se persiste metadato de confianza de la fuente: nunca importes,
    // conceptos, cuentas ni filas bancarias.
    window.localStorage.setItem(SAFE_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // El almacenamiento puede estar bloqueado por el navegador. La app sigue
    // funcionando con el caché efímero en memoria.
  }
}

export function getCachedSourceTrust(now = Date.now()) {
  if (!cacheEntry) {
    const persisted = readPersistedSnapshot();
    if (persisted && now - persisted.checkedAt < cacheTtl(persisted.payload)) cacheEntry = persisted;
  }
  if (!cacheEntry) return null;
  if (now - cacheEntry.checkedAt >= cacheTtl(cacheEntry.payload)) return null;
  return cacheEntry.payload;
}

export function getLastSafeSourceTrust(now = Date.now()): SafeSourceTrustSnapshot | null {
  const candidate = cacheEntry ?? readPersistedSnapshot();
  if (!candidate || now - candidate.checkedAt > SAFE_SNAPSHOT_MAX_AGE_MS) return null;
  return candidate;
}

export function shouldRevalidateSourceTrust(now = Date.now()) {
  return getCachedSourceTrust(now) === null;
}

export function invalidateSourceTrustCache() {
  generation += 1;
  cacheEntry = null;
  inFlightRequest = null;
}

export function loadSourceTrustFreshness() {
  const cached = getCachedSourceTrust();
  if (cached) return Promise.resolve(cached);
  if (inFlightRequest) return inFlightRequest;

  const requestGeneration = generation;
  let request: Promise<SourceFreshness | null>;

  request = fetch("/api/analysis/source-freshness", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload: unknown = await response.json().catch(() => null);
      return isSourceFreshness(payload) ? payload : null;
    })
    .then((payload) => {
      if (requestGeneration !== generation) return null;
      if (!payload) {
        cacheEntry = null;
        return null;
      }
      const snapshot = { payload, checkedAt: Date.now() };
      cacheEntry = snapshot;
      persistSafeSnapshot(snapshot);
      return payload;
    })
    .catch(() => {
      if (requestGeneration === generation) cacheEntry = null;
      return null;
    })
    .finally(() => {
      if (inFlightRequest === request) inFlightRequest = null;
    });

  inFlightRequest = request;
  return request;
}
