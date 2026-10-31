/**
 * Read an authenticated document response with a real size bound, even when
 * Content-Length is absent or deliberately understated. A rejected stream is
 * cancelled; no downstream consumer receives incomplete bytes.
 */
export class LimitedResponseBodyError extends Error {
  constructor(public readonly reason: "unavailable" | "too_large" | "read_failed") {
    super("limited_response_body_" + reason);
    this.name = "LimitedResponseBodyError";
  }
}

export async function readLimitedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("invalid_document_response_limit");
  }
  if (!response.body) throw new LimitedResponseBodyError("unavailable");

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new LimitedResponseBodyError("unavailable");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new LimitedResponseBodyError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof LimitedResponseBodyError) throw error;
    throw new LimitedResponseBodyError("read_failed");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
