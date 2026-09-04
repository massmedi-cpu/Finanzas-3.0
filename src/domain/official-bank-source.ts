import { createHash } from "node:crypto";
import type { AccountType, TransactionKind, TransactionReviewState } from "./models";
import { buildSourceFingerprint, buildSourceRowIdentity, type BankSourceIdentityInput } from "./source-identity";

export const OFFICIAL_BANK_SOURCE_HEADERS = [
  "ID origen",
  "Fecha",
  "Hora",
  "Producto o cuenta",
  "Entidad",
  "Identificador",
  "Tipo de producto",
  "Tipo de movimiento",
  "Categoría",
  "Subcategoría",
  "Concepto original",
  "Concepto normalizado",
  "Comercio o contraparte",
  "Importe (€)",
  "Saldo (€)",
  "Canal",
  "Cuenta de origen",
  "Cuenta de destino",
  "Conciliado",
  "Revisar",
  "Notas",
  "Fuente",
] as const;

export type OfficialBankSourceHeader = (typeof OFFICIAL_BANK_SOURCE_HEADERS)[number];
export type SourceCellValue = string | number | boolean | null;

export type OfficialSourceAccountContract = {
  sheetTitle: string;
  accountName: string;
  institution: string;
  identifier: string;
  productType: string;
  accountType: AccountType;
};

/**
 * Contrato observado y verificado contra la fuente oficial el 04/09/2026.
 * Una pestaña o cuenta nueva no se interpreta por heurística: debe añadirse al
 * contrato después de verificarla.
 */
export const OFFICIAL_SOURCE_ACCOUNT_CONTRACTS: Readonly<Record<string, OfficialSourceAccountContract>> = {
  "Cuenta corriente · 3967": {
    sheetTitle: "Cuenta corriente · 3967",
    accountName: "Cuenta corriente Openbank · 3967",
    institution: "Openbank",
    identifier: "****3967",
    productType: "Cuenta bancaria",
    accountType: "checking",
  },
  "Cuenta ahorro · 2504": {
    sheetTitle: "Cuenta ahorro · 2504",
    accountName: "Cuenta ahorro Openbank · 2504",
    institution: "Openbank",
    identifier: "****2504",
    productType: "Cuenta bancaria",
    accountType: "savings",
  },
};

export class OfficialSourceContractError extends Error {
  constructor(
    public readonly code:
      | "schema_mismatch"
      | "invalid_row_width"
      | "missing_required_value"
      | "invalid_date"
      | "invalid_money"
      | "unknown_movement_type"
      | "invalid_review_value"
      | "unknown_account_sheet"
      | "account_contract_mismatch",
    message: string,
    public readonly field: OfficialBankSourceHeader | null = null,
  ) {
    super(message);
    this.name = "OfficialSourceContractError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildOfficialSourceSchemaFingerprint(headers: readonly unknown[]) {
  return sha256(JSON.stringify(headers));
}

export function validateOfficialSourceHeaders(headers: readonly unknown[]) {
  if (headers.length !== OFFICIAL_BANK_SOURCE_HEADERS.length) {
    throw new OfficialSourceContractError(
      "schema_mismatch",
      `La fuente debe tener exactamente ${OFFICIAL_BANK_SOURCE_HEADERS.length} columnas y contiene ${headers.length}.`,
    );
  }

  for (let index = 0; index < OFFICIAL_BANK_SOURCE_HEADERS.length; index += 1) {
    if (headers[index] !== OFFICIAL_BANK_SOURCE_HEADERS[index]) {
      throw new OfficialSourceContractError(
        "schema_mismatch",
        `La columna ${index + 1} debe ser “${OFFICIAL_BANK_SOURCE_HEADERS[index]}” y se recibió “${String(headers[index] ?? "")}”.`,
        OFFICIAL_BANK_SOURCE_HEADERS[index],
      );
    }
  }

  return buildOfficialSourceSchemaFingerprint(headers);
}

function normalizedRow(values: readonly unknown[]): SourceCellValue[] {
  if (values.length > OFFICIAL_BANK_SOURCE_HEADERS.length) {
    throw new OfficialSourceContractError(
      "invalid_row_width",
      `La fila contiene ${values.length} valores para un contrato de ${OFFICIAL_BANK_SOURCE_HEADERS.length} columnas.`,
    );
  }

  return OFFICIAL_BANK_SOURCE_HEADERS.map((_, index) => {
    const value = values[index];
    if (value === undefined || value === "") return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    throw new OfficialSourceContractError("invalid_row_width", `Tipo de celda no admitido en la columna ${index + 1}.`);
  });
}

function requireText(value: SourceCellValue, field: OfficialBankSourceHeader) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OfficialSourceContractError("missing_required_value", `Falta un valor de texto obligatorio en “${field}”.`, field);
  }
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
}

function parseDateCell(value: SourceCellValue): string {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 100_000) {
      throw new OfficialSourceContractError("invalid_date", "La fecha serial de Google Sheets no es válida.", "Fecha");
    }
    const milliseconds = Date.UTC(1899, 11, 30) + value * 86_400_000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  }

  throw new OfficialSourceContractError(
    "invalid_date",
    "La fecha no coincide con el formato sin interpretar solicitado al adaptador de Google Sheets.",
    "Fecha",
  );
}

function decimalStringToCents(value: string, field: OfficialBankSourceHeader) {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new OfficialSourceContractError("invalid_money", `“${field}” no contiene un importe decimal seguro.`, field);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = Number((match[3] ?? "").padEnd(2, "0"));
  const cents = sign * (whole * 100 + fraction);
  if (!Number.isSafeInteger(cents)) {
    throw new OfficialSourceContractError("invalid_money", `“${field}” excede el rango monetario seguro.`, field);
  }
  return cents;
}

function parseMoneyCell(value: SourceCellValue, field: OfficialBankSourceHeader, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new OfficialSourceContractError("invalid_money", `“${field}” no contiene un número finito.`, field);
    }
    return decimalStringToCents(value.toString(), field);
  }
  if (typeof value === "string") return decimalStringToCents(value, field);
  throw new OfficialSourceContractError("invalid_money", `Falta un importe válido en “${field}”.`, field);
}

function parseMovementType(value: SourceCellValue): TransactionKind {
  const movement = requireText(value, "Tipo de movimiento");
  if (movement === "Ingreso") return "income";
  if (movement === "Gasto") return "expense";
  if (movement === "Traspaso interno") return "transfer";
  throw new OfficialSourceContractError(
    "unknown_movement_type",
    `Tipo de movimiento no reconocido: “${movement}”. Se detiene esta fila en lugar de inferirlo.`,
    "Tipo de movimiento",
  );
}

function parseReviewState(value: SourceCellValue): TransactionReviewState {
  if (value === "Sí") return "needs_review";
  if (value === "No") return "pending";
  throw new OfficialSourceContractError(
    "invalid_review_value",
    `“Revisar” debe ser “Sí” o “No” y se recibió “${String(value ?? "")}”.`,
    "Revisar",
  );
}

function verifyAccountContract(sheetTitle: string, payload: Readonly<Record<OfficialBankSourceHeader, SourceCellValue>>) {
  const contract = OFFICIAL_SOURCE_ACCOUNT_CONTRACTS[sheetTitle];
  if (!contract) {
    throw new OfficialSourceContractError(
      "unknown_account_sheet",
      `La pestaña “${sheetTitle}” no está registrada en el contrato de cuentas. No se inferirá automáticamente.`,
    );
  }

  const actual = {
    accountName: requireText(payload["Producto o cuenta"], "Producto o cuenta"),
    institution: requireText(payload.Entidad, "Entidad"),
    identifier: requireText(payload.Identificador, "Identificador"),
    productType: requireText(payload["Tipo de producto"], "Tipo de producto"),
  };

  if (
    actual.accountName !== contract.accountName ||
    actual.institution !== contract.institution ||
    actual.identifier !== contract.identifier ||
    actual.productType !== contract.productType
  ) {
    throw new OfficialSourceContractError(
      "account_contract_mismatch",
      `La cuenta observada en “${sheetTitle}” ha cambiado respecto al contrato verificado.`,
      "Producto o cuenta",
    );
  }

  return contract;
}

export type ParsedOfficialSourceRow = {
  accountContract: OfficialSourceAccountContract;
  sourcePayload: Readonly<Record<OfficialBankSourceHeader, SourceCellValue>>;
  observation: BankSourceIdentityInput;
  sourceRowIdentity: string;
  sourceFingerprint: string;
  conceptNormalized: string;
  transactionKind: TransactionKind;
  reviewState: TransactionReviewState;
};

export function parseOfficialSourceRow(input: {
  sourceFileId: string;
  sourceSheetId: string;
  sheetTitle: string;
  values: readonly unknown[];
}): ParsedOfficialSourceRow {
  if (input.sourceFileId.trim() === "" || input.sourceSheetId.trim() === "") {
    throw new OfficialSourceContractError("missing_required_value", "Falta la identidad técnica de la fuente o pestaña.");
  }

  const row = normalizedRow(input.values);
  const sourcePayload = Object.fromEntries(
    OFFICIAL_BANK_SOURCE_HEADERS.map((header, index) => [header, row[index]]),
  ) as Record<OfficialBankSourceHeader, SourceCellValue>;

  const accountContract = verifyAccountContract(input.sheetTitle, sourcePayload);
  const sourceRowKey = requireText(sourcePayload["ID origen"], "ID origen");
  const bankDate = parseDateCell(sourcePayload.Fecha);
  const conceptOriginal = requireText(sourcePayload["Concepto original"], "Concepto original");
  const conceptNormalized = requireText(sourcePayload["Concepto normalizado"], "Concepto normalizado");
  const amountCents = parseMoneyCell(sourcePayload["Importe (€)"], "Importe (€)");
  const balanceAfterCents = parseMoneyCell(sourcePayload["Saldo (€)"], "Saldo (€)", true);
  const accountExternalKey = requireText(sourcePayload["Producto o cuenta"], "Producto o cuenta");

  const observation: BankSourceIdentityInput = {
    sourceFileId: input.sourceFileId.trim(),
    sourceSheetId: input.sourceSheetId.trim(),
    sourceRowKey,
    bankDate,
    conceptOriginal,
    amountCents,
    balanceAfterCents,
    accountExternalKey,
    sourcePayload,
  };

  return {
    accountContract,
    sourcePayload,
    observation,
    sourceRowIdentity: buildSourceRowIdentity(observation),
    sourceFingerprint: buildSourceFingerprint(observation),
    conceptNormalized,
    transactionKind: parseMovementType(sourcePayload["Tipo de movimiento"]),
    reviewState: parseReviewState(sourcePayload.Revisar),
  };
}
