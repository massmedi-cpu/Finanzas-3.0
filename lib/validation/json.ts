export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

export function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function nullableNumber(value: unknown): number | null {
  return value == null || value === "" ? null : asNumber(value);
}

export function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

export function field(record: JsonRecord, key: string): unknown {
  return record[key];
}

export function nestedRecord(record: JsonRecord, key: string): JsonRecord {
  return asRecord(record[key]);
}

export function recordArray(value: unknown): JsonRecord[] {
  return asArray(value).map(asRecord);
}
