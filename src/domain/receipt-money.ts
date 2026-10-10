function compactReceiptMoney(text: string) {
  return text.replace(/[€\s\u00a0]/g, "");
}

function parseParts(text: string): { integerDigits: string; decimals: string; negative: boolean } | null {
  const token = compactReceiptMoney(text);
  // OCR providers may return the mathematical minus (U+2212) or an en dash
  // (U+2013) for a refund. Sign belongs to the full numeric token.
  const negative = /^[-\u2212\u2013]/.test(token);
  const unsigned = negative ? token.slice(1) : token;

  const spanishGrouped = unsigned.match(/^(\d{1,3}(?:\.\d{3})+),(\d{2})$/);
  if (spanishGrouped) {
    return { integerDigits: spanishGrouped[1].replaceAll(".", ""), decimals: spanishGrouped[2], negative };
  }

  const alternateGrouped = unsigned.match(/^(\d{1,3}(?:,\d{3})+)\.(\d{2})$/);
  if (alternateGrouped) {
    return { integerDigits: alternateGrouped[1].replaceAll(",", ""), decimals: alternateGrouped[2], negative };
  }

  const plain = unsigned.match(/^(\d{1,9})[,.](\d{2})$/);
  if (plain) return { integerDigits: plain[1], decimals: plain[2], negative };

  return null;
}

export function receiptMoneyCents(text: string) {
  const parts = parseParts(text);
  if (!parts) return null;
  const integer = Number(parts.integerDigits);
  const decimals = Number(parts.decimals);
  if (!Number.isSafeInteger(integer) || integer < 0 || !Number.isInteger(decimals)) return null;
  const cents = integer * 100 + decimals;
  return Number.isSafeInteger(cents) ? (cents === 0 ? 0 : parts.negative ? -cents : cents) : null;
}

export function isReceiptMoney(text: string) {
  return receiptMoneyCents(text) !== null;
}

export function receiptMoneyKey(text: string) {
  const cents = receiptMoneyCents(text);
  return cents === null ? null : `money:${cents}`;
}

export function normalizeReceiptMoneyEs(text: string) {
  const cents = receiptMoneyCents(text);
  if (cents === null) return null;
  const magnitude = Math.abs(cents);
  const euros = Math.floor(magnitude / 100);
  const decimals = String(magnitude % 100).padStart(2, "0");
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}${grouped},${decimals}`;
}
