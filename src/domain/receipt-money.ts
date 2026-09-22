function compactReceiptMoney(text: string) {
  return text.replace(/[€\s\u00a0]/g, "");
}

function parseParts(text: string): { integerDigits: string; decimals: string } | null {
  const token = compactReceiptMoney(text);

  const spanishGrouped = token.match(/^(\d{1,3}(?:\.\d{3})+),(\d{2})$/);
  if (spanishGrouped) {
    return { integerDigits: spanishGrouped[1].replaceAll(".", ""), decimals: spanishGrouped[2] };
  }

  const alternateGrouped = token.match(/^(\d{1,3}(?:,\d{3})+)\.(\d{2})$/);
  if (alternateGrouped) {
    return { integerDigits: alternateGrouped[1].replaceAll(",", ""), decimals: alternateGrouped[2] };
  }

  const plain = token.match(/^(\d{1,9})[,.](\d{2})$/);
  if (plain) return { integerDigits: plain[1], decimals: plain[2] };

  return null;
}

export function receiptMoneyCents(text: string) {
  const parts = parseParts(text);
  if (!parts) return null;
  const integer = Number(parts.integerDigits);
  const decimals = Number(parts.decimals);
  if (!Number.isSafeInteger(integer) || integer < 0 || !Number.isInteger(decimals)) return null;
  const cents = integer * 100 + decimals;
  return Number.isSafeInteger(cents) ? cents : null;
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
  const euros = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, "0");
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${decimals}`;
}
