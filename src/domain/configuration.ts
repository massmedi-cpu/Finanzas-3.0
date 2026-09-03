import type {
  AccountType,
  CategoryKind,
  EntityId,
  MoneyCents,
} from "./models";

export interface AccountDraft {
  name: string;
  institution: string | null;
  type: AccountType;
  openingBalanceCents: MoneyCents;
  lifecycle: "active" | "archived";
  sortOrder: number;
}

export interface CategoryDraft {
  name: string;
  kind: CategoryKind;
  parentCategoryId: EntityId | null;
  iconKey: string;
  colorToken: string;
  lifecycle: "active" | "archived";
  sortOrder: number;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

const ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "checking",
  "savings",
  "credit",
  "cash",
  "investment",
  "other",
]);

const CATEGORY_KINDS: ReadonlySet<CategoryKind> = new Set([
  "income",
  "expense",
  "transfer",
]);

export function validateAccountDraft(draft: AccountDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!draft.name.trim()) {
    issues.push({
      field: "name",
      code: "required",
      message: "La cuenta debe tener un nombre.",
    });
  }

  if (!ACCOUNT_TYPES.has(draft.type)) {
    issues.push({
      field: "type",
      code: "invalid_account_type",
      message: "El tipo de cuenta no es válido.",
    });
  }

  if (!Number.isSafeInteger(draft.openingBalanceCents)) {
    issues.push({
      field: "openingBalanceCents",
      code: "invalid_money",
      message: "El saldo inicial debe almacenarse como céntimos enteros seguros.",
    });
  }

  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) {
    issues.push({
      field: "sortOrder",
      code: "invalid_sort_order",
      message: "El orden debe ser un entero igual o superior a cero.",
    });
  }

  return issues;
}

export function validateCategoryDraft(draft: CategoryDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!draft.name.trim()) {
    issues.push({
      field: "name",
      code: "required",
      message: "La categoría debe tener un nombre.",
    });
  }

  if (!CATEGORY_KINDS.has(draft.kind)) {
    issues.push({
      field: "kind",
      code: "invalid_category_kind",
      message: "El tipo de categoría no es válido.",
    });
  }

  if (!draft.iconKey.trim()) {
    issues.push({
      field: "iconKey",
      code: "required",
      message: "La categoría debe tener un icono.",
    });
  }

  if (!draft.colorToken.trim()) {
    issues.push({
      field: "colorToken",
      code: "required",
      message: "La categoría debe tener un color.",
    });
  }

  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) {
    issues.push({
      field: "sortOrder",
      code: "invalid_sort_order",
      message: "El orden debe ser un entero igual o superior a cero.",
    });
  }

  return issues;
}
