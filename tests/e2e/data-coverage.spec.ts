import { expect, test } from "@playwright/test";
import {
  dateHasConfirmedCoverage,
  periodComparisonIsReliable,
  periodHasObservedData,
  resolvePeriodCoverage,
} from "../../src/application/data-coverage";
import { assembleCashFlow, type CashFlowTransaction } from "../../src/application/cash-flow/cash-flow-model";

const expense: CashFlowTransaction = {
  id: "10000000-0000-4000-8000-000000000001",
  bankDate: "2026-09-29",
  amountCents: -1_000,
  account: { id: "20000000-0000-4000-8000-000000000002", name: "Cuenta" },
  concept: { effective: "Compra" },
  kind: { effective: "expense" },
  duplicateState: "none",
  excludedFromAnalytics: false,
};

test("AUD-E2E-DAT-001 · distingue cobertura desconocida, ausente, parcial y cubierta", () => {
  const unknown = resolvePeriodCoverage({ dateFrom: "2026-10-01", dateTo: "2026-10-31", latestMovementDate: null });
  const none = resolvePeriodCoverage({ dateFrom: "2026-10-01", dateTo: "2026-10-31", latestMovementDate: "2026-09-29" });
  const partial = resolvePeriodCoverage({ dateFrom: "2026-09-01", dateTo: "2026-09-30", latestMovementDate: "2026-09-29" });
  const covered = resolvePeriodCoverage({ dateFrom: "2026-08-01", dateTo: "2026-08-31", latestMovementDate: "2026-09-29" });

  expect(unknown.state).toBe("unknown");
  expect(none.state).toBe("none");
  expect(partial).toMatchObject({ state: "partial", throughDate: "2026-09-29" });
  expect(covered).toMatchObject({ state: "covered", throughDate: "2026-08-31" });
  expect(periodHasObservedData(partial)).toBe(true);
  expect(periodComparisonIsReliable(partial)).toBe(false);
  expect(periodComparisonIsReliable(covered)).toBe(true);
  expect(dateHasConfirmedCoverage("2026-09-29", partial)).toBe(true);
  expect(dateHasConfirmedCoverage("2026-09-30", partial)).toBe(false);
});

test("AUD-E2E-DAT-001 · Cash Flow corta el realizado en la última fecha observada", () => {
  const view = assembleCashFlow({
    month: "2026-09",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    transactions: [expense],
    transactionState: "complete",
    period: {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      accountId: null,
      operatingNetCents: -1_000,
      quality: { scopedRows: 1, includedRows: 1 },
    },
    forecast: null,
    latestMovementDate: "2026-09-29",
  });

  expect(view.actualCoverage.state).toBe("partial");
  expect(view.actualNetCents).toBe(-1_000);
  expect(view.evolution.find((point) => point.date === "2026-09-29")?.realCumulativeCents).toBe(-1_000);
  expect(view.evolution.find((point) => point.date === "2026-09-30")?.realCumulativeCents).toBeNull();
});

test("AUD-E2E-DAT-001 · ausencia de cobertura no se convierte en cero y cero cubierto sigue siendo válido", () => {
  const october = assembleCashFlow({
    month: "2026-10",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-31",
    transactions: [],
    transactionState: "complete",
    period: {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      accountId: null,
      operatingNetCents: 0,
      quality: { scopedRows: 0, includedRows: 0 },
    },
    forecast: null,
    latestMovementDate: "2026-09-29",
  });
  expect(october.actualCoverage.state).toBe("none");
  expect(october.actualNetCents).toBeNull();

  const august = assembleCashFlow({
    month: "2026-08",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    transactions: [],
    transactionState: "complete",
    period: {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      accountId: null,
      operatingNetCents: 0,
      quality: { scopedRows: 0, includedRows: 0 },
    },
    forecast: null,
    latestMovementDate: "2026-09-29",
  });
  expect(august.actualCoverage.state).toBe("covered");
  expect(august.actualNetCents).toBe(0);
});


test("AUD-E2E-DAT-001 · fechas bancarias imposibles o periodos invertidos no certifican cobertura", () => {
  for (const latestMovementDate of ["2026-02-30", "2026-13-01", "2026-00-09", "2026-09-31"]) {
    const coverage = resolvePeriodCoverage({
      dateFrom: "2026-02-01", dateTo: "2026-02-28", latestMovementDate,
    });
    expect(coverage).toEqual({ state: "unknown", latestMovementDate: null, throughDate: null });
    expect(periodComparisonIsReliable(coverage)).toBe(false);
  }
  const reverse = resolvePeriodCoverage({
    dateFrom: "2026-10-31", dateTo: "2026-10-01", latestMovementDate: "2026-10-31",
  });
  expect(reverse.state).toBe("unknown");
  expect(periodComparisonIsReliable(reverse)).toBe(false);
  const impossibleStart = resolvePeriodCoverage({
    dateFrom: "2026-02-30", dateTo: "2026-03-31", latestMovementDate: "2026-03-31",
  });
  expect(impossibleStart.state).toBe("unknown");
  const leap = resolvePeriodCoverage({
    dateFrom: "2024-02-29", dateTo: "2024-02-29", latestMovementDate: "2024-02-29",
  });
  expect(leap.state).toBe("covered");
  expect(dateHasConfirmedCoverage("2026-02-30", leap)).toBe(false);
});
 

test("AUD-E2E-DAT-001 · cobertura confirmada no legitima fechas posteriores al periodo", () => {
  const covered = resolvePeriodCoverage({
    dateFrom: "2026-08-01", dateTo: "2026-08-31", latestMovementDate: "2026-09-29",
  });
  expect(dateHasConfirmedCoverage("2026-08-31", covered)).toBe(true);
  expect(dateHasConfirmedCoverage("2026-09-01", covered)).toBe(false);
  expect(dateHasConfirmedCoverage("2026-12-31", covered)).toBe(false);
  const unknown = resolvePeriodCoverage({
    dateFrom: "2026-08-01", dateTo: "2026-08-31", latestMovementDate: null,
  });
  expect(dateHasConfirmedCoverage("2026-08-15", unknown)).toBe(false);
});

test("REC-COV-002 · los límites del histórico evitan ceros anteriores al primer movimiento", () => {
  const bounds = { earliestMovementDate: "2026-07-04", latestMovementDate: "2026-09-29" };
  const before = resolvePeriodCoverage({ dateFrom: "2025-12-01", dateTo: "2025-12-31", ...bounds });
  expect(before).toMatchObject({ state: "none", fromDate: "2026-07-04", throughDate: null });
  expect(periodHasObservedData(before)).toBe(false);
  const first = resolvePeriodCoverage({ dateFrom: "2026-07-01", dateTo: "2026-07-31", ...bounds });
  expect(first).toMatchObject({ state: "partial", fromDate: "2026-07-04", throughDate: "2026-07-31" });
  expect(periodComparisonIsReliable(first)).toBe(false);
  expect(dateHasConfirmedCoverage("2026-07-03", first)).toBe(false);
  expect(dateHasConfirmedCoverage("2026-07-04", first)).toBe(true);
  const later = resolvePeriodCoverage({ dateFrom: "2026-08-01", dateTo: "2026-08-31", ...bounds });
  expect(later.state).toBe("covered");
  const after = resolvePeriodCoverage({ dateFrom: "2026-10-01", dateTo: "2026-10-31", ...bounds });
  expect(after.state).toBe("none");
  const impossible = resolvePeriodCoverage({
    dateFrom: "2026-08-01", dateTo: "2026-08-31",
    earliestMovementDate: "2026-10-01", latestMovementDate: "2026-09-29",
  });
  expect(impossible.state).toBe("unknown");
  const invalid = resolvePeriodCoverage({
    dateFrom: "2026-08-01", dateTo: "2026-08-31",
    earliestMovementDate: "2026-02-30", latestMovementDate: "2026-09-29",
  });
  expect(invalid.state).toBe("unknown");
});
