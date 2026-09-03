type MoneyShape = "explicit" | "integer" | "compact" | "damaged" | "unknown";

function moneyParts(text: string) {
  const raw = text.trim();
  const compact = raw.replace(/\s/g, "");
  const currency = compact.match(/[€$£]/)?.[0] ?? "";
  const numeric = compact.replace(/[€$£]/g, "");
  return { raw, compact, currency, numeric };
}

function parseMoneyValue(text: string) {
  const { numeric } = moneyParts(text);
  if (/^[+-]?\d+[.,]\d{2}$/.test(numeric)) {
    const value = Number(numeric.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (/^[+-]?\d{3,5}$/.test(numeric)) {
    const value = Number(numeric) / 100;
    return Number.isFinite(value) ? value : null;
  }
  if (/^[+-]?\d{1,2}$/.test(numeric)) {
    const value = Number(numeric);
    return Number.isFinite(value) ? value : null;
  }
  if (/^[+-]?\d{1,3}'\d{2}$/.test(numeric)) {
    const value = Number(numeric.replace("'", "."));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function moneyShape(text: string): MoneyShape {
  const { numeric } = moneyParts(text);
  if (/^[+-]?\d+[.,]\d{2}$/.test(numeric)) return "explicit";
  if (/^[+-]?\d{1,2}$/.test(numeric)) return "integer";
  if (/^[+-]?\d{3,5}$/.test(numeric)) return "compact";
  if (/^[+-]?\d{1,3}'\d{2}$/.test(numeric)) return "damaged";
  return "unknown";
}

function normalizedRenderedNumber(text: string) {
  const { numeric } = moneyParts(text);
  const match = numeric.match(/[+-]?\d+(?:[.,]\d{2})?/);
  return match?.[0] ?? numeric;
}

function restoreCurrencyPlacement(original: string, number: string) {
  const symbol = original.match(/[€$£]/)?.[0];
  if (!symbol) return number;
  const firstDigit = original.search(/\d/);
  const symbolIndex = original.indexOf(symbol);
  if (symbolIndex >= 0 && (firstDigit < 0 || symbolIndex < firstDigit)) {
    const spaced = new RegExp(`${symbol.replace("$", "\\$")}\\s+`).test(original);
    return `${symbol}${spaced ? " " : ""}${number}`;
  }
  const spaced = new RegExp(`\\s+${symbol.replace("$", "\\$")}`).test(original);
  return `${number}${spaced ? " " : ""}${symbol}`;
}

/**
 * Keeps visual evidence separate from financial normalization.
 *
 * Explicit decimal punctuation and currency placement are preserved exactly
 * when the OCR text and normalized table value represent the same amount.
 * Compact/damaged forms such as "1460" or "1'50" are the exception: those are
 * reconstructed from the already validated numeric value, because the missing
 * decimal separator is an OCR artefact rather than printed typography.
 */
export function receiptMoneyDisplayText(renderedText: string, originalText?: string | null) {
  const original = String(originalText ?? "").trim();
  if (!original) return renderedText;

  const renderedValue = parseMoneyValue(renderedText);
  const originalValue = parseMoneyValue(original);
  if (renderedValue == null || originalValue == null || Math.abs(renderedValue - originalValue) > 0.011) {
    return renderedText;
  }

  const shape = moneyShape(original);
  if (shape === "explicit" || shape === "integer") return original;
  if (shape === "compact" || shape === "damaged") {
    return restoreCurrencyPlacement(original, normalizedRenderedNumber(renderedText));
  }
  return renderedText;
}
