import { expect, test } from "@playwright/test";

test("forecast API rejects a zero-value manual item before persistence", async ({ request }) => {
  const response = await request.post("/api/forecast", {
    data: {
      action: "manual",
      date: "2099-01-10",
      concept: "ZERO MUST NOT PERSIST",
      amountCents: 0,
      confidence: "high",
    },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_forecast_amount",
  });
});
