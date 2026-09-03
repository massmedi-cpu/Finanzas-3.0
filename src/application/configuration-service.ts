import type { AccountDraft, CategoryDraft } from "../domain/configuration";
import type { Account, Category, EntityId, ISOTimestamp } from "../domain/models";
import type { AccountRepository, CategoryRepository } from "../domain/ports";
import {
  prepareAccountReorder,
  prepareCategoryMerge,
  prepareCategoryReorder,
  prepareNewAccount,
  prepareNewCategory,
  prepareUpdatedAccount,
  prepareUpdatedCategory,
} from "./configuration-commands";

export interface IdentityProvider {
  nextId(): EntityId;
}

export interface Clock {
  now(): ISOTimestamp;
}

export class ConfigurationNotFoundError extends Error {
  constructor(entity: "cuenta" | "categoría", id: EntityId) {
    super(`No existe la ${entity} ${id}.`);
    this.name = "ConfigurationNotFoundError";
  }
}

export class ConfigurationService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly identities: IdentityProvider,
    private readonly clock: Clock,
  ) {}

  listAccounts() {
    return this.accounts.list();
  }

  listCategories() {
    return this.categories.list();
  }

  async createAccount(draft: AccountDraft): Promise<Account> {
    const existing = await this.accounts.list();
    const account = prepareNewAccount(draft, existing, this.identities.nextId(), this.clock.now());
    return this.accounts.save(account);
  }

  async updateAccount(id: EntityId, draft: AccountDraft): Promise<Account> {
    const [current, existing] = await Promise.all([
      this.accounts.getById(id),
      this.accounts.list(),
    ]);
    if (!current) {
      throw new ConfigurationNotFoundError("cuenta", id);
    }

    const account = prepareUpdatedAccount(current, draft, existing, this.clock.now());
    return this.accounts.save(account);
  }

  async setAccountArchived(id: EntityId, archived: boolean): Promise<Account> {
    const current = await this.accounts.getById(id);
    if (!current) {
      throw new ConfigurationNotFoundError("cuenta", id);
    }

    return this.updateAccount(id, {
      name: current.name,
      institution: current.institution,
      type: current.type,
      openingBalanceCents: current.openingBalanceCents,
      lifecycle: archived ? "archived" : "active",
      sortOrder: current.sortOrder,
    });
  }

  async reorderAccounts(orderedIds: EntityId[]): Promise<void> {
    const existing = await this.accounts.list();
    const prepared = prepareAccountReorder(existing, orderedIds);
    await this.accounts.reorder(prepared);
  }

  async createCategory(draft: CategoryDraft): Promise<Category> {
    const existing = await this.categories.list();
    const category = prepareNewCategory(draft, existing, this.identities.nextId(), this.clock.now());
    return this.categories.save(category);
  }

  async updateCategory(id: EntityId, draft: CategoryDraft): Promise<Category> {
    const [current, existing] = await Promise.all([
      this.categories.getById(id),
      this.categories.list(),
    ]);
    if (!current) {
      throw new ConfigurationNotFoundError("categoría", id);
    }

    const category = prepareUpdatedCategory(current, draft, existing, this.clock.now());
    return this.categories.save(category);
  }

  async setCategoryArchived(id: EntityId, archived: boolean): Promise<Category> {
    const current = await this.categories.getById(id);
    if (!current) {
      throw new ConfigurationNotFoundError("categoría", id);
    }

    return this.updateCategory(id, {
      name: current.name,
      kind: current.kind,
      parentCategoryId: current.parentCategoryId,
      iconKey: current.iconKey,
      colorToken: current.colorToken,
      lifecycle: archived ? "archived" : "active",
      sortOrder: current.sortOrder,
    });
  }

  async reorderCategories(orderedIds: EntityId[]): Promise<void> {
    const existing = await this.categories.list();
    const prepared = prepareCategoryReorder(existing, orderedIds);
    await this.categories.reorder(prepared);
  }

  async mergeCategories(sourceCategoryId: EntityId, targetCategoryId: EntityId): Promise<void> {
    const [source, target, existing] = await Promise.all([
      this.categories.getById(sourceCategoryId),
      this.categories.getById(targetCategoryId),
      this.categories.list(),
    ]);
    if (!source) {
      throw new ConfigurationNotFoundError("categoría", sourceCategoryId);
    }
    if (!target) {
      throw new ConfigurationNotFoundError("categoría", targetCategoryId);
    }

    const prepared = prepareCategoryMerge(source, target, existing);
    await this.categories.merge(prepared.sourceCategoryId, prepared.targetCategoryId);
  }
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export const cryptoIdentityProvider: IdentityProvider = {
  nextId: () => crypto.randomUUID(),
};
