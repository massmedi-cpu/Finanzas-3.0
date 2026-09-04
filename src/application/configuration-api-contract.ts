import type { AccountDraft, CategoryDraft } from "../domain/configuration";
import type { AccountType, CategoryKind, EntityId, EntityLifecycle } from "../domain/models";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const LIFECYCLES: ReadonlySet<EntityLifecycle> = new Set(["active", "archived"]);

export type ConfigurationApiCommand =
  | { operation: "account.create"; draft: AccountDraft }
  | { operation: "account.update"; id: EntityId; draft: AccountDraft }
  | { operation: "account.archive"; id: EntityId; archived: boolean }
  | { operation: "account.reorder"; orderedIds: EntityId[] }
  | { operation: "category.create"; draft: CategoryDraft }
  | { operation: "category.update"; id: EntityId; draft: CategoryDraft }
  | { operation: "category.archive"; id: EntityId; archived: boolean }
  | { operation: "category.reorder"; orderedIds: EntityId[] }
  | {
      operation: "category.merge";
      sourceCategoryId: EntityId;
      targetCategoryId: EntityId;
    };

export class ConfigurationRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigurationRequestError";
  }
}

function fail(code: string, message: string): never {
  throw new ConfigurationRequestError(code, message);
}

function asRecord(value: unknown, field = "body"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_object", `${field} debe ser un objeto JSON.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
  field: string,
) {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    fail("unexpected_field", `${field} contiene campos no admitidos: ${unexpected.join(", ")}.`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_string", `${field} debe ser un texto no vacío.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    fail("invalid_string", `${field} debe ser texto o null.`);
  }
  return value;
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail("invalid_integer", `${field} debe ser un entero seguro.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = safeInteger(value, field);
  if (parsed < 0) {
    fail("invalid_integer", `${field} debe ser igual o superior a cero.`);
  }
  return parsed;
}

function exactBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail("invalid_boolean", `${field} debe ser booleano.`);
  }
  return value;
}

function entityId(value: unknown, field: string): EntityId {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail("invalid_id", `${field} debe ser un UUID válido.`);
  }
  return value;
}

function entityIds(value: unknown, field: string): EntityId[] {
  if (!Array.isArray(value)) {
    fail("invalid_id_list", `${field} debe ser una lista de UUID.`);
  }
  const ids = value.map((item, index) => entityId(item, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) {
    fail("duplicate_id", `${field} no puede contener identificadores repetidos.`);
  }
  return ids;
}

function accountType(value: unknown): AccountType {
  if (typeof value !== "string" || !ACCOUNT_TYPES.has(value as AccountType)) {
    fail("invalid_account_type", "draft.type no es un tipo de cuenta válido.");
  }
  return value as AccountType;
}

function categoryKind(value: unknown): CategoryKind {
  if (typeof value !== "string" || !CATEGORY_KINDS.has(value as CategoryKind)) {
    fail("invalid_category_kind", "draft.kind no es un tipo de categoría válido.");
  }
  return value as CategoryKind;
}

function lifecycle(value: unknown): EntityLifecycle {
  if (typeof value !== "string" || !LIFECYCLES.has(value as EntityLifecycle)) {
    fail("invalid_lifecycle", "draft.lifecycle no es un estado válido.");
  }
  return value as EntityLifecycle;
}

function accountDraft(value: unknown): AccountDraft {
  const draft = asRecord(value, "draft");
  assertExactKeys(
    draft,
    ["name", "institution", "type", "openingBalanceCents", "lifecycle", "sortOrder"],
    "draft",
  );
  return {
    name: requiredString(draft.name, "draft.name"),
    institution: nullableString(draft.institution, "draft.institution"),
    type: accountType(draft.type),
    openingBalanceCents: safeInteger(draft.openingBalanceCents, "draft.openingBalanceCents"),
    lifecycle: lifecycle(draft.lifecycle),
    sortOrder: nonNegativeInteger(draft.sortOrder, "draft.sortOrder"),
  };
}

function categoryDraft(value: unknown): CategoryDraft {
  const draft = asRecord(value, "draft");
  assertExactKeys(
    draft,
    ["name", "kind", "parentCategoryId", "iconKey", "colorToken", "lifecycle", "sortOrder"],
    "draft",
  );
  return {
    name: requiredString(draft.name, "draft.name"),
    kind: categoryKind(draft.kind),
    parentCategoryId:
      draft.parentCategoryId === null
        ? null
        : entityId(draft.parentCategoryId, "draft.parentCategoryId"),
    iconKey: requiredString(draft.iconKey, "draft.iconKey"),
    colorToken: requiredString(draft.colorToken, "draft.colorToken"),
    lifecycle: lifecycle(draft.lifecycle),
    sortOrder: nonNegativeInteger(draft.sortOrder, "draft.sortOrder"),
  };
}

export function parseConfigurationApiCommand(value: unknown): ConfigurationApiCommand {
  const body = asRecord(value);
  const operation = requiredString(body.operation, "operation");

  switch (operation) {
    case "account.create":
      assertExactKeys(body, ["operation", "draft"], "body");
      return { operation, draft: accountDraft(body.draft) };
    case "account.update":
      assertExactKeys(body, ["operation", "id", "draft"], "body");
      return { operation, id: entityId(body.id, "id"), draft: accountDraft(body.draft) };
    case "account.archive":
      assertExactKeys(body, ["operation", "id", "archived"], "body");
      return {
        operation,
        id: entityId(body.id, "id"),
        archived: exactBoolean(body.archived, "archived"),
      };
    case "account.reorder":
      assertExactKeys(body, ["operation", "orderedIds"], "body");
      return { operation, orderedIds: entityIds(body.orderedIds, "orderedIds") };
    case "category.create":
      assertExactKeys(body, ["operation", "draft"], "body");
      return { operation, draft: categoryDraft(body.draft) };
    case "category.update":
      assertExactKeys(body, ["operation", "id", "draft"], "body");
      return { operation, id: entityId(body.id, "id"), draft: categoryDraft(body.draft) };
    case "category.archive":
      assertExactKeys(body, ["operation", "id", "archived"], "body");
      return {
        operation,
        id: entityId(body.id, "id"),
        archived: exactBoolean(body.archived, "archived"),
      };
    case "category.reorder":
      assertExactKeys(body, ["operation", "orderedIds"], "body");
      return { operation, orderedIds: entityIds(body.orderedIds, "orderedIds") };
    case "category.merge":
      assertExactKeys(body, ["operation", "sourceCategoryId", "targetCategoryId"], "body");
      return {
        operation,
        sourceCategoryId: entityId(body.sourceCategoryId, "sourceCategoryId"),
        targetCategoryId: entityId(body.targetCategoryId, "targetCategoryId"),
      };
    default:
      fail("unsupported_operation", `Operación no admitida: ${operation}.`);
  }
}
