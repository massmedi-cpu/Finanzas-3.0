import type { AccountRepository, CategoryRepository } from "../../domain/ports";
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  EntityId,
  EntityLifecycle,
  ISOTimestamp,
} from "../../domain/models";
import { PersistenceInvariantError } from "./sql-executor";
import { callPersistenceGateway } from "./vercel-supabase-gateway";

type AccountRow = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  opening_balance_cents: number | string;
  currency: "EUR";
  lifecycle: EntityLifecycle;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CategoryRow = {
  id: string;
  name: string;
  kind: CategoryKind;
  parent_category_id: string | null;
  icon_key: string;
  color_token: string;
  lifecycle: EntityLifecycle;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RowsResult<Row> = { rows: Row[] };

type OkResult = { ok: true };

function asSafeInteger(value: number | string, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new PersistenceInvariantError(`${field} debe ser un entero seguro.`);
  }
  return numeric;
}

function asTimestamp(value: string): ISOTimestamp {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PersistenceInvariantError("La persistencia ha devuelto una fecha inválida.");
  }
  return date.toISOString();
}

function mapAccount(row: AccountRow): Account {
  if (row.currency !== "EUR") {
    throw new PersistenceInvariantError("La persistencia de cuentas solo admite EUR.");
  }

  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    openingBalanceCents: asSafeInteger(row.opening_balance_cents, "opening_balance_cents"),
    currency: "EUR",
    lifecycle: row.lifecycle,
    sortOrder: asSafeInteger(row.sort_order, "sort_order"),
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentCategoryId: row.parent_category_id,
    iconKey: row.icon_key,
    colorToken: row.color_token,
    lifecycle: row.lifecycle,
    sortOrder: asSafeInteger(row.sort_order, "sort_order"),
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
  };
}

export class EdgeAccountRepository implements AccountRepository {
  async list(): Promise<Account[]> {
    const result = await callPersistenceGateway<RowsResult<AccountRow>>("account.list");
    return result.rows.map(mapAccount);
  }

  async getById(id: EntityId): Promise<Account | null> {
    const result = await callPersistenceGateway<RowsResult<AccountRow>>("account.get", { id });
    return result.rows[0] ? mapAccount(result.rows[0]) : null;
  }

  async save(account: Account): Promise<Account> {
    const result = await callPersistenceGateway<RowsResult<AccountRow>>("account.save", { account });
    const saved = result.rows[0];
    if (!saved) throw new PersistenceInvariantError("La cuenta no se ha persistido.");
    return mapAccount(saved);
  }

  async reorder(orderedIds: EntityId[]): Promise<void> {
    await callPersistenceGateway<OkResult>("account.reorder", { orderedIds });
  }
}

export class EdgeCategoryRepository implements CategoryRepository {
  async list(): Promise<Category[]> {
    const result = await callPersistenceGateway<RowsResult<CategoryRow>>("category.list");
    return result.rows.map(mapCategory);
  }

  async getById(id: EntityId): Promise<Category | null> {
    const result = await callPersistenceGateway<RowsResult<CategoryRow>>("category.get", { id });
    return result.rows[0] ? mapCategory(result.rows[0]) : null;
  }

  async save(category: Category): Promise<Category> {
    const result = await callPersistenceGateway<RowsResult<CategoryRow>>("category.save", { category });
    const saved = result.rows[0];
    if (!saved) throw new PersistenceInvariantError("La categoría no se ha persistido.");
    return mapCategory(saved);
  }

  async reorder(orderedIds: EntityId[]): Promise<void> {
    await callPersistenceGateway<OkResult>("category.reorder", { orderedIds });
  }

  async merge(sourceCategoryId: EntityId, targetCategoryId: EntityId): Promise<void> {
    await callPersistenceGateway<OkResult>("category.merge", {
      sourceCategoryId,
      targetCategoryId,
    });
  }
}
