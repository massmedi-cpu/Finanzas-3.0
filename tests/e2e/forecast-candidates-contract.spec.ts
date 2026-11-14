import { expect, test } from "@playwright/test";
import {
  isForecastCandidateSnapshotForRequest,
  isForecastCandidateSnapshotForItem,
} from "../../src/application/forecast/forecast-contract";

const itemId = "81000000-0000-4000-8000-000000000081";
const transactionId = "82000000-0000-4000-8000-000000000082";
const accountId = "10000000-0000-4000-8000-000000000001";
const item = { id: itemId, date: "2026-10-13", amountCents: -7250 };
const query = { itemId, days: 7, limit: 8 };
function fixture() {
  return {
    forecastItemId: itemId,
    forecastDate: item.date,
    forecastAmountCents: item.amountCents,
    days: 7,
    candidates: [{
      transactionId, date: "2026-10-12", amountCents: -7300,
      differenceCents: 50, dayDifference: 1, accountId,
      categoryId: null, merchantId: null, concept: "SEGURO REAL",
    }],
  };
}
test("REC-FCAST-042 · candidatos válidos pertenecen al ítem y su fecha", () => {
  expect(isForecastCandidateSnapshotForRequest(fixture(), query)).toBe(true);
  expect(isForecastCandidateSnapshotForItem(fixture(), item, 7, 8)).toBe(true);
});
test("REC-FCAST-043 · rechaza IDs, importes, fechas y resultados repetidos pese a HTTP 200", () => {
  const source = fixture();
  expect(isForecastCandidateSnapshotForRequest({ ...source, forecastItemId: accountId }, query)).toBe(false);
  expect(isForecastCandidateSnapshotForItem({ ...source, forecastAmountCents: -7251 }, item, 7, 8)).toBe(false);
  expect(isForecastCandidateSnapshotForItem({ ...source, forecastDate: "2026-10-14" }, item, 7, 8)).toBe(false);
  expect(isForecastCandidateSnapshotForRequest({ ...source, candidates: [...source.candidates, source.candidates[0]] }, query)).toBe(false);
  expect(isForecastCandidateSnapshotForRequest({ ...source, candidates: [{ ...source.candidates[0], amountCents: 7300 }] }, query)).toBe(false);
  expect(isForecastCandidateSnapshotForRequest({ ...source, candidates: [{ ...source.candidates[0], dayDifference: 12 }] }, query)).toBe(false);
  expect(isForecastCandidateSnapshotForRequest({ ...source, candidates: [{ ...source.candidates[0], amountCents: Number.MAX_SAFE_INTEGER + 1 }] }, query)).toBe(false);
});
test("REC-FCAST-050 · diferencia mostrada debe coincidir exactamente con los céntimos bancarios", () => {
  const valid = fixture();
  expect(isForecastCandidateSnapshotForRequest(valid, query)).toBe(true);
  for (const differenceCents of [49, -50, 51, Number.MAX_SAFE_INTEGER]) {
    expect(isForecastCandidateSnapshotForRequest({
      ...valid,
      candidates: [{ ...valid.candidates[0], differenceCents }],
    }, query), `differenceCents=${differenceCents}`).toBe(false);
  }
  expect(isForecastCandidateSnapshotForRequest({
    ...valid,
    forecastAmountCents: Number.MAX_SAFE_INTEGER,
    candidates: [{ ...valid.candidates[0], amountCents: -Number.MAX_SAFE_INTEGER }],
  }, query)).toBe(false);
});

test("REC-FCAST-051 · no ofrecer candidatos de otra cuenta cuando la previsión tiene cuenta propia", () => {
  const valid = fixture();
  const scopedItem = { ...item, accountId };
  expect(isForecastCandidateSnapshotForItem(valid, scopedItem, 7, 8)).toBe(true);
  const otherAccount = "10000000-0000-4000-8000-000000000073";
  expect(isForecastCandidateSnapshotForItem({
    ...valid,
    candidates: [{ ...valid.candidates[0], accountId: otherAccount }],
  }, scopedItem, 7, 8)).toBe(false);
  // Un forecast sin cuenta asignada permite cualquier cuenta legítima del usuario.
  expect(isForecastCandidateSnapshotForItem({
    ...valid,
    candidates: [{ ...valid.candidates[0], accountId: otherAccount }],
  }, { ...item, accountId: null }, 7, 8)).toBe(true);
});

test("REC-FCAST-045 · GET financiero rechaza parámetros de selección repetidos", async ({ request }) => {
  for (const queryString of [
    "dateFrom=2026-10-01&dateFrom=2026-10-02&dateTo=2026-10-31",
    "dateFrom=2026-10-01&dateTo=2026-10-31&accountId=&accountId=",
    "itemId=" + itemId + "&itemId=" + itemId,
    "itemId=" + itemId + "&days=7&days=8",
    "itemId=" + itemId + "&limit=8&limit=2",
  ]) {
    const response = await request.get("/api/forecast?" + queryString);
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request", code: "invalid_forecast_duplicate_parameters",
    });
  }
});
