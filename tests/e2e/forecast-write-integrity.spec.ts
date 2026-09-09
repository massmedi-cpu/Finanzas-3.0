import { expect, test } from "@playwright/test";
import { handleForecastLogicAction } from "../../supabase/functions/financial-app-db-gateway/forecast-logic";

const forecastItemId = "81000000-0000-4000-8000-000000000081";
const idempotencyKey = "83000000-0000-4000-8000-000000000083";

const manualPayload = {
  date: "2026-09-15",
  concept: "Seguro anual",
  amountCents: -1234,
  accountId: null,
  categoryId: null,
  merchantId: null,
  confidence: "high",
  idempotencyKey,
};

test("PRE-007 retrying the same manual forecast create does not duplicate it", async () => {
  let inserts = 0;
  const idsByKey = new Map<string, string>();

  const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const receivedKey = values[7];
    let id: string;

    if (typeof receivedKey === "string") {
      const existing = idsByKey.get(receivedKey);
      if (existing) {
        id = existing;
      } else {
        inserts += 1;
        id = `81000000-0000-4000-8000-${String(inserts).padStart(12, "0")}`;
        idsByKey.set(receivedKey, id);
      }
    } else {
      inserts += 1;
      id = `81000000-0000-4000-8000-${String(inserts).padStart(12, "0")}`;
    }

    return Promise.resolve([{ result: { id, origin: "manual", idempotencyKey: receivedKey ?? null } }]);
  };

  const first = await handleForecastLogicAction({
    action: "forecast.manual",
    payload: manualPayload,
    sql,
    environment: "preview",
  });
  const second = await handleForecastLogicAction({
    action: "forecast.manual",
    payload: manualPayload,
    sql,
    environment: "preview",
  });

  expect(first?.status).toBe(200);
  expect(second?.status).toBe(200);
  const firstBody = await first!.json();
  const secondBody = await second!.json();
  expect(firstBody.id).toBe(secondBody.id);
  expect(firstBody.idempotencyKey).toBe(idempotencyKey);
  expect(inserts).toBe(1);
});

test("PRE-007 stale forecast mutation returns 409 instead of overwriting newer state", async () => {
  const staleVersion = "2026-09-09T04:00:00.000Z";
  const actualVersion = "2026-09-09T04:01:00.000Z";
  let receivedExpectedVersion: unknown = null;

  const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    receivedExpectedVersion = values[3];
    if (receivedExpectedVersion !== actualVersion) {
      throw new Error("forecast_write_conflict");
    }
    return Promise.resolve([{ result: { id: forecastItemId, excluded: true, updatedAt: actualVersion } }]);
  };

  const response = await handleForecastLogicAction({
    action: "forecast.exclude",
    payload: {
      id: forecastItemId,
      excluded: true,
      reason: "Ya no se espera este cargo",
      expectedUpdatedAt: staleVersion,
    },
    sql,
    environment: "preview",
  });

  expect(receivedExpectedVersion).toBe(staleVersion);
  expect(response?.status).toBe(409);
  await expect(response!.json()).resolves.toEqual({ error: "forecast_write_conflict" });
});
