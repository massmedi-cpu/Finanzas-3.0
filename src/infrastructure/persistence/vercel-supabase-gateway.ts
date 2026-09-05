import { gzipSync } from "node:zlib";
import { getVercelOidcToken } from "@vercel/oidc";

const SUPABASE_GATEWAY_URL =
  "https://btzukbfesxdratqnxuoj.supabase.co/functions/v1/financial-app-db-gateway";
const SUPABASE_GATEWAY_REGION = "eu-west-3";
export const PERSISTENCE_GATEWAY_GZIP_THRESHOLD_BYTES = 64 * 1024;

export type EncodedPersistenceGatewayRequest = {
  body: string | Uint8Array;
  contentEncoding: "gzip" | null;
  originalBytes: number;
  encodedBytes: number;
};

export function encodePersistenceGatewayRequest(
  action: string,
  payload: Record<string, unknown> = {},
): EncodedPersistenceGatewayRequest {
  const serialized = JSON.stringify({ action, payload });
  const originalBytes = Buffer.byteLength(serialized, "utf8");

  if (originalBytes < PERSISTENCE_GATEWAY_GZIP_THRESHOLD_BYTES) {
    return {
      body: serialized,
      contentEncoding: null,
      originalBytes,
      encodedBytes: originalBytes,
    };
  }

  const compressed = Uint8Array.from(gzipSync(serialized));
  return {
    body: compressed,
    contentEncoding: "gzip",
    originalBytes,
    encodedBytes: compressed.byteLength,
  };
}

export class PersistenceGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PersistenceGatewayError";
  }
}

export async function callPersistenceGateway<Result>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Result> {
  const oidcToken = await getVercelOidcToken({
    project: "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo",
    team: "team_xrSskbkRKwQkyYc0vvLVGUnb",
    expirationBufferMs: 60_000,
  });

  if (!oidcToken) {
    throw new PersistenceGatewayError("Vercel no ha proporcionado identidad OIDC.", 503, "oidc_unavailable");
  }

  const encodedRequest = encodePersistenceGatewayRequest(action, payload);
  const headers: Record<string, string> = {
    authorization: `Bearer ${oidcToken}`,
    "content-type": "application/json",
    "x-region": SUPABASE_GATEWAY_REGION,
  };
  if (encodedRequest.contentEncoding) {
    headers["content-encoding"] = encodedRequest.contentEncoding;
  }

  const response = await fetch(SUPABASE_GATEWAY_URL, {
    method: "POST",
    headers,
    body: encodedRequest.body as BodyInit,
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | (Result & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new PersistenceGatewayError(
      "El gateway de persistencia ha rechazado la operación.",
      response.status,
      body?.error,
    );
  }

  if (body.error) {
    throw new PersistenceGatewayError(
      "La operación de persistencia no se ha completado.",
      response.status,
      body.error,
    );
  }

  return body;
}
