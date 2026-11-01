import { expect, test } from "@playwright/test";
import { formatSplitAmountInput, parseSplitAmountInput } from "../../src/application/transactions/split-amount-format";
import { formatMoneyCents, parseMoneyInputToCents, parseSpanishMoneyToCents } from "../../src/core/money";

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


test("REC-SPLIT-003 · round trip of extreme but safe cent values without fractional loss", () => {
  for (const cents of [1, 87, 100, 1732, 123456, 9_007_199_254_740_987, Number.MAX_SAFE_INTEGER]) {
    const display = formatSplitAmountInput(cents);
    expect(parseSplitAmountInput(display), `${cents}: ${display}`).toBe(cents);
  }
  expect(formatSplitAmountInput(Number.MAX_SAFE_INTEGER)).toBe("90.071.992.547.409,91");
  expect(formatSplitAmountInput(-Number.MAX_SAFE_INTEGER)).toBe("90.071.992.547.409,91");
});

test("REC-SPLIT-004 · refuse cent values above the safe exact integer boundary", () => {
  expect(parseSplitAmountInput("90.071.992.547.409,92")).toBeNull();
  expect(parseSplitAmountInput("999999999999999999,99")).toBeNull();
});
