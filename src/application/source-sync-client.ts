import type { OfficialSourcePreflightSummary } from "./source-preflight";
import type { SourceSyncBatchResult } from "./source-sync-service";
import {
  isConfirmedSourcePreflight, isConfirmedSourceSyncResponse, sourcePreflightConfirmation,
} from "./source-confirmation-contract";

export class SourceSyncClientError extends Error {
  constructor(readonly code: string, readonly syncRequested: boolean) {
    super(code);
    this.name = "SourceSyncClientError";
  }
}

type SourceClientOptions = { fetcher?: typeof fetch; signal?: AbortSignal };
type ConfirmedSyncResponse = SourceSyncBatchResult & { sourceRevision: string | null; snapshotFingerprint: string };

function responseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload
    && typeof payload.error === "string" && /^[a-z_]{1,80}$/.test(payload.error)) return payload.error;
  return fallback;
}

export async function readOfficialSourcePreflight(options: SourceClientOptions = {}): Promise<OfficialSourcePreflightSummary> {
  try {
    const response = await (options.fetcher ?? fetch)("/api/source/google/preflight", {
      method: "POST", cache: "no-store", signal: options.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new SourceSyncClientError(responseError(payload, "source_preflight_failed"), false);
    if (!isConfirmedSourcePreflight(payload)) throw new SourceSyncClientError("source_preflight_invalid", false);
    return payload;
  } catch (error) {
    if (error instanceof SourceSyncClientError) throw error;
    throw new SourceSyncClientError("source_preflight_unavailable", false);
  }
}

/**
 * One protocol for Inicio, automatic updates and both source screens.
 * No mutation before a valid preflight; no retry after an uncertain result.
 * A prior preflight is accepted only for the explicit diagnostics workflow;
 * the server must still read again and compare the complete fingerprint.
 */
export async function synchronizeOfficialSource(
  options: SourceClientOptions & { preflight?: OfficialSourcePreflightSummary } = {},
): Promise<ConfirmedSyncResponse> {
  const preflight = options.preflight ?? await readOfficialSourcePreflight(options);
  if (!isConfirmedSourcePreflight(preflight)) throw new SourceSyncClientError("source_preflight_invalid", false);
  if (options.signal?.aborted) throw new SourceSyncClientError("source_preflight_unavailable", false);
  try {
    const response = await (options.fetcher ?? fetch)("/api/source/google/sync", {
      method: "POST", cache: "no-store", signal: options.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(sourcePreflightConfirmation(preflight)),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new SourceSyncClientError(responseError(payload, "google_source_sync_unconfirmed"), true);
    if (!isConfirmedSourceSyncResponse(payload, preflight)) {
      throw new SourceSyncClientError("google_source_sync_unconfirmed", true);
    }
    return payload;
  } catch (error) {
    if (error instanceof SourceSyncClientError) throw error;
    throw new SourceSyncClientError("google_source_sync_unconfirmed", true);
  }
}
