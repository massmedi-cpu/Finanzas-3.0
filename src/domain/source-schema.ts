export const SOURCE_COLUMNS = [
  'ID origen',
  'Fecha',
  'Hora',
  'Producto o cuenta',
  'Entidad',
  'Identificador',
  'Tipo de producto',
  'Tipo de movimiento',
  'Categoría',
  'Subcategoría',
  'Concepto original',
  'Concepto normalizado',
  'Comercio o contraparte',
  'Importe (€)',
  'Saldo (€)',
  'Canal',
  'Cuenta de origen',
  'Cuenta de destino',
  'Conciliado',
  'Revisar',
  'Notas',
  'Fuente',
] as const;

export type SourceColumn = (typeof SOURCE_COLUMNS)[number];

export interface BankingSourceRow {
  sourceId: string;
  date: string;
  time: string;
  productOrAccount: string;
  institution: string;
  identifier: string;
  productType: string;
  movementType: string;
  category: string;
  subcategory: string;
  originalConcept: string;
  normalizedConcept: string;
  merchantOrCounterparty: string;
  amount: number | null;
  balance: number | null;
  channel: string;
  originAccount: string;
  destinationAccount: string;
  reconciled: string;
  review: string;
  notes: string;
  source: string;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseEuro(value: unknown): number | null {
  const raw = clean(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSpanishDate(value: unknown): string {
  const raw = clean(value);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!match) return raw;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function validateSourceHeader(header: unknown[]): boolean {
  if (header.length < SOURCE_COLUMNS.length) return false;
  return SOURCE_COLUMNS.every((column, index) => clean(header[index]) === column);
}

export function parseSourceRow(row: unknown[]): BankingSourceRow {
  return {
    sourceId: clean(row[0]),
    date: normalizeSpanishDate(row[1]),
    time: clean(row[2]),
    productOrAccount: clean(row[3]),
    institution: clean(row[4]),
    identifier: clean(row[5]),
    productType: clean(row[6]),
    movementType: clean(row[7]),
    category: clean(row[8]),
    subcategory: clean(row[9]),
    originalConcept: clean(row[10]),
    normalizedConcept: clean(row[11]),
    merchantOrCounterparty: clean(row[12]),
    amount: parseEuro(row[13]),
    balance: parseEuro(row[14]),
    channel: clean(row[15]),
    originAccount: clean(row[16]),
    destinationAccount: clean(row[17]),
    reconciled: clean(row[18]),
    review: clean(row[19]),
    notes: clean(row[20]),
    source: clean(row[21]),
  };
}
