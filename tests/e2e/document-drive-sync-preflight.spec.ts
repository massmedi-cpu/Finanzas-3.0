import { expect, test } from "@playwright/test";
import { POST } from "../../app/api/documents/drive-sync/route";

test("Drive validates configuration before starting persistence or network work", async () => {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const originalFetch = globalThis.fetch;
  const unhandled: unknown[] = [];
  let requests = 0;
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  globalThis.fetch = async () => { requests += 1; throw new Error("unexpected_network_request"); };
  try {
    const response = await POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "drive_auto_detection_unavailable" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(requests).toBe(0);
    expect(unhandled).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
    process.off("unhandledRejection", onUnhandled);
    if (credentials === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = credentials;
  }
});
