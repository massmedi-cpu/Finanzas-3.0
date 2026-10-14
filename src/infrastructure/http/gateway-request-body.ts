import { gunzipSync } from "node:zlib";
import {
  LimitedResponseBodyError,
  readLimitedResponseBody,
} from "./limited-response-body";

export const MAX_COMPRESSED_GATEWAY_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_DECOMPRESSED_GATEWAY_BODY_BYTES = 16 * 1024 * 1024;

function parseGatewayJsonBody(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength === 0) return {};
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * A gateway request must be bounded BEFORE it is buffered, including when
 * Content-Length is absent or lies. A compressed request is subject to both
 * the compressed input cap and the inflated output cap.
 *
 * Keep this independently testable: the Edge handler calls it only after
 * validating Vercel OIDC and before opening a workspace-scoped connection.
 */
export async function readGatewayJsonBody(request: Request): Promise<Record<string, unknown>> {
  const encoding = (request.headers.get("content-encoding") ?? "").trim().toLowerCase();
  if (encoding && encoding !== "identity" && encoding !== "gzip") {
    throw new Error("unsupported_content_encoding");
  }
  const compressed = encoding === "gzip";
  const inputLimit = compressed ? MAX_COMPRESSED_GATEWAY_BODY_BYTES : MAX_DECOMPRESSED_GATEWAY_BODY_BYTES;
  const sizeError = compressed ? "gateway_compressed_body_too_large" : "gateway_body_too_large";
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim())
    && Number(declared.trim()) > inputLimit) {
    throw new Error(sizeError);
  }

  let input: Uint8Array;
  if (!request.body) {
    input = new Uint8Array(0);
  } else {
    try {
      // Request.body and Response.body are Web Streams. Reusing the bounded
      // reader also ensures an oversized stream is cancelled at its cap.
      input = await readLimitedResponseBody(new Response(request.body), inputLimit);
    } catch (error) {
      if (error instanceof LimitedResponseBodyError && error.reason === "too_large") {
        throw new Error(sizeError);
      }
      throw new Error("gateway_body_read_failed");
    }
  }

  if (!compressed) return parseGatewayJsonBody(input);

  let inflated: Uint8Array;
  try {
    // A post-decompression length check is too late for a gzip bomb.
    inflated = gunzipSync(input, { maxOutputLength: MAX_DECOMPRESSED_GATEWAY_BODY_BYTES });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error
      && error.code === "ERR_BUFFER_TOO_LARGE") {
      throw new Error("gateway_body_too_large");
    }
    throw new Error("invalid_gateway_gzip");
  }
  return parseGatewayJsonBody(inflated);
}
