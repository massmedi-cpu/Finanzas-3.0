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
import { PersistenceInvariantError, type SqlExecutor, type SqlRow } from "./sql-executor";

type AccountRow = SqlRow & {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  opening_balance_cents: number | string;
  currency: "EUR";
  lifecycle: EntityLifecycle;
  sort_order: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type CategoryRow = SqlRow & {
  id: string;
  name: string;
  kind: CategoryKind;
  parent_category_id: string | null;
  icon_key: string;
  color_token: string;
  lifecycle: EntityLifecycle;
  sort_order: number;
  created_at: string | Date;
  updated_at: string | Date;
};

const ACCOUNT_COLUMNS = `
  id,
  name,
  institution,
  type,
  opening_balance_cents,
  currency,
  lifecycle,
  sort_order,
  created_at,
  updated_at
`;

const CATEGORY_COLUMNS = `
  id,
  name,
  kind,
  parent_category_id,
  icon_key,
  color_token,
  lifecycle,
  sort_order,
  created_at,
  updated_at
`;

function asTimestamp(value: string | Date): ISOTimestamp {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asSafeInteger(value: number | string, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new PersistenceInvariantError(`${field} debe ser un entero seguro.`);
  }
  return numeric;
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

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async list(): Promise<Account[]> {
    const result = await this.sql.query<AccountRow>(
      `select ${ACCOUNT_COLUMNS}
       from financial_app.accounts
       order by case lifecycle when 'active' then 0 else 1 end, sort_order, name, id`,
    );
    return result.rows.map(mapAccount);
  }

  async getById(id: EntityId): Promise<Account | null> {
    const result = await this.sql.query<AccountRow>(
      `select ${ACCOUNT_COLUMNS}
       from financial_app.accounts
       where id = $1::uuid`,
      [id],
    );
    return result.rows[0] ? mapAccount(result.rows[0]) : null;
  }

  async save(account: Account): Promise<Account> {
    const result = await this.sql.query<AccountRow>(
      `insert into financial_app.accounts (
         id, name, institution, type, opening_balance_cents, currency,
         lifecycle, sort_order, created_at, updated_at
       ) values (
         $1::uuid, $2, $3, $4, $5, 'EUR', $6, $7, $8::timestamptz, $9::timestamptz
       )
       on conflict (id) do update set
         name = excluded.name,
         institution = excluded.institution,
         type = excluded.type,
         opening_balance_cents = excluded.opening_balance_cents,
         currency = 'EUR',
         lifecycle = excluded.lifecycle,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       returning ${ACCOUNT_COLUMNS}`,
      [
        account.id,
        account.name,
        account.institution,
        account.type,
        account.openingBalanceCents,
        account.lifecycle,
        account.sortOrder,
        account.createdAt,
        account.updatedAt,
      ],
    );

    const saved = result.rows[0];
    if (!saved) {
      throw new PersistenceInvariantError("La cuenta no se ha persistido.");
    }
    return mapAccount(saved);
  }

  async reorder(orderedIds: EntityId[]): Promise<void> {
    await this.sql.query(
      `select financial_app.reorder_accounts($1::uuid[])`,
      [orderedIds],
    );
  }
}

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async list(): Promise<Category[]> {
    const result = await this.sql.query<CategoryRow>(
      `select ${CATEGORY_COLUMNS}
       from financial_app.categories
       order by kind, parent_category_id nulls first, sort_order, name, id`,
    );
    return result.rows.map(mapCategory);
  }

  async getById(id: EntityId): Promise<Category | null> {
    const result = await this.sql.query<CategoryRow>(
      `select ${CATEGORY_COLUMNS}
       from financial_app.categories
       where id = $1::uuid`,
      [id],
    );
    return result.rows[0] ? mapCategory(result.rows[0]) : null;
  }

  async save(category: Category): Promise<Category> {
    const result = await this.sql.query<CategoryRow>(
      `insert into financial_app.categories (
         id, name, kind, parent_category_id, icon_key, color_token,
         lifecycle, sort_order, created_at, updated_at
       ) values (
         $1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz
       )
       on conflict (id) do update set
         name = excluded.name,
         kind = excluded.kind,
         parent_category_id = excluded.parent_category_id,
         icon_key = excluded.icon_key,
         color_token = excluded.color_token,
         lifecycle = excluded.lifecycle,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       returning ${CATEGORY_COLUMNS}`,
      [
        category.id,
        category.name,
        category.kind,
        category.parentCategoryId,
        category.iconKey,
        category.colorToken,
        category.lifecycle,
        category.sortOrder,
        category.createdAt,
        category.updatedAt,
      ],
    );

    const saved = result.rows[0];
    if (!saved) {
      throw new PersistenceInvariantError("La categoría no se ha persistido.");
    }
    return mapCategory(saved);
  }

  async reorder(orderedIds: EntityId[]): Promise<void> {
    await this.sql.query(
      `select financial_app.reorder_categories($1::uuid[])`,
      [orderedIds],
    );
  }

  async merge(sourceCategoryId: EntityId, targetCategoryId: EntityId): Promise<void> {
    await this.sql.query(
      `select financial_app.merge_categories($1::uuid, $2::uuid)`,
      [sourceCategoryId, targetCategoryId],
    );
  }
}
