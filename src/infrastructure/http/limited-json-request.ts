import {
  LimitedResponseBodyError,
  readLimitedResponseBody,
} from "./limited-response-body";

/**
 * Enforce the HTTP payload cap *while* consuming the request stream.
 * request.json() buffers the entire body first, even if the object would
 * ultimately fail the document-review field validators.
 */
export class LimitedJsonRequestError extends Error {
  constructor(public readonly reason: "too_large" | "unreadable" | "invalid_json") {
    super("limited_json_request_" + reason);
    this.name = "LimitedJsonRequestError";
  }
}

export async function readLimitedJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("invalid_json_request_limit");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength.trim())
    && Number(declaredLength.trim()) > maxBytes) {
    throw new LimitedJsonRequestError("too_large");
  }

  let bytes: Uint8Array;
  try {
    // Reuses the document stream's cancellation-on-overflow and bounded
    // accumulation. Never let Content-Length alone determine actual size.
    bytes = await readLimitedResponseBody(new Response(request.body), maxBytes);
  } catch (error) {
    if (error instanceof LimitedResponseBodyError) {
      throw new LimitedJsonRequestError(error.reason === "too_large" ? "too_large" : "unreadable");
    }
    throw new LimitedJsonRequestError("unreadable");
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new LimitedJsonRequestError("invalid_json");
  }
}
