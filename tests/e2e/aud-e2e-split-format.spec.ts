import { expect, test } from "@playwright/test";
import { formatSplitAmountInput, parseSplitAmountInput } from "../../src/application/transactions/split-amount-format";

test("AUD-E2E-FMT-001 · importe español y sumas exactas", () => {
  expect(formatSplitAmountInput(-1732)).toBe("17,32");
  expect(formatSplitAmountInput(123456)).toBe("1.234,56");
  expect(parseSplitAmountInput("10,00")).toBe(1000);
  expect(parseSplitAmountInput("7,32")).toBe(732);
  expect(parseSplitAmountInput("10,00")! + parseSplitAmountInput("7,32")!).toBe(1732);
});

test("AUD-E2E-FMT-001 · pegado y rechazo de importes ambiguos", () => {
  expect(parseSplitAmountInput("1.234,56 €")).toBe(123456);
  expect(parseSplitAmountInput("17.32")).toBe(1732);
  for (const invalid of ["1.234", "1,234", "1,234.56", "12,345", "1.2.3", "7,321", "0", "0,00", "-17,32"]) {
    expect(parseSplitAmountInput(invalid), invalid).toBeNull();
  }
});

import { formatMoneyCents, parseMoneyInputToCents, parseSpanishMoneyToCents } from "../../src/core/money";

test("REC-MONEY-001 · reject misplaced whitespace without silently changing euros or cents", () => {
  const malformed = [
    "1 2,34", "1 234,56", "1\u00a0234,56", "1\u202f234,56",
    "1\t234,56", "12, 34", "1. 234,56", "- 12,34", "1 234,56 €",
  ];
  for (const raw of malformed) {
    expect(() => parseSpanishMoneyToCents(raw), raw).toThrow(RangeError);
    expect(() => parseMoneyInputToCents(raw), raw).toThrow(RangeError);
  }
});

test("REC-MONEY-002 · preserve Spanish grouping, EUR suffix and legitimate decimal-dot input", () => {
  expect(parseSpanishMoneyToCents("1.234,56 €")).toBe(123456);
  expect(parseSpanishMoneyToCents(" -1.234,56\u00a0€ ")).toBe(-123456);
  expect(parseMoneyInputToCents("1.234,56")).toBe(123456);
  expect(parseMoneyInputToCents("1234.56")).toBe(123456);
  expect(parseMoneyInputToCents("1.234,56 €")).toBe(123456);
  expect(parseMoneyInputToCents(formatMoneyCents(123456))).toBe(123456);
  expect(parseMoneyInputToCents("-12,34")).toBe(-1234);
});
