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

test("forecast snapshot rejects an inverted period before persistence", async ({ request }) => {
  const response = await request.get("/api/forecast?dateFrom=2099-04-10&dateTo=2099-04-01");

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_forecast_date_range",
  });
});

test("recurrence refresh rejects an inverted period before persistence", async ({ request }) => {
  const response = await request.post("/api/forecast", {
    data: {
      action: "refresh",
      dateFrom: "2099-04-10",
      dateTo: "2099-04-01",
    },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_forecast_date_range",
  });
});

test("forecast API rejects more than 730 days for reads and refresh before persistence", async ({ request }) => {
  const read = await request.get("/api/forecast?dateFrom=2099-01-01&dateTo=2101-01-02");
  expect(read.status()).toBe(400);
  await expect(read.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_forecast_date_range_too_large",
  });

  const refresh = await request.post("/api/forecast", {
    data: { action: "refresh", dateFrom: "2099-01-01", dateTo: "2101-01-02" },
  });
  expect(refresh.status()).toBe(400);
  await expect(refresh.json()).resolves.toEqual({
    error: "invalid_request",
    code: "invalid_forecast_date_range_too_large",
  });
});
