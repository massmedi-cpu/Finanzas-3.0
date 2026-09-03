import type { AccountDraft, CategoryDraft, ValidationIssue } from "../domain/configuration";
import { validateAccountDraft, validateCategoryDraft } from "../domain/configuration";
import {
  validateAccountUniqueness,
  validateCategoryHierarchy,
  validateCategoryMerge,
  validateCategoryUniqueness,
  validateReorder,
} from "../domain/configuration-policies";
import type { Account, Category, EntityId, ISOTimestamp } from "../domain/models";

export class ConfigurationValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "ConfigurationValidationError";
  }
}

function requireValid(issues: ValidationIssue[]) {
  if (issues.length > 0) {
    throw new ConfigurationValidationError(issues);
  }
}

export function prepareNewAccount(
  draft: AccountDraft,
  existing: ReadonlyArray<Account>,
  id: EntityId,
  now: ISOTimestamp,
): Account {
  const candidate: Account = {
    id,
    name: draft.name.trim().replace(/\s+/g, " "),
    institution: draft.institution?.trim().replace(/\s+/g, " ") || null,
    type: draft.type,
    openingBalanceCents: draft.openingBalanceCents,
    currency: "EUR",
    lifecycle: draft.lifecycle,
    sortOrder: draft.sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  requireValid([
    ...validateAccountDraft(draft),
    ...validateAccountUniqueness(candidate, existing),
  ]);

  return candidate;
}

export function prepareUpdatedAccount(
  current: Account,
  draft: AccountDraft,
  existing: ReadonlyArray<Account>,
  now: ISOTimestamp,
): Account {
  const candidate: Account = {
    ...current,
    name: draft.name.trim().replace(/\s+/g, " "),
    institution: draft.institution?.trim().replace(/\s+/g, " ") || null,
    type: draft.type,
    openingBalanceCents: draft.openingBalanceCents,
    lifecycle: draft.lifecycle,
    sortOrder: draft.sortOrder,
    updatedAt: now,
  };

  requireValid([
    ...validateAccountDraft(draft),
    ...validateAccountUniqueness(candidate, existing),
  ]);

  return candidate;
}

export function prepareAccountReorder(
  existing: ReadonlyArray<Account>,
  orderedIds: ReadonlyArray<EntityId>,
) {
  requireValid(validateReorder(existing.map((account) => account.id), orderedIds));
  return [...orderedIds];
}

export function prepareNewCategory(
  draft: CategoryDraft,
  existing: ReadonlyArray<Category>,
  id: EntityId,
  now: ISOTimestamp,
): Category {
  const candidate: Category = {
    id,
    name: draft.name.trim().replace(/\s+/g, " "),
    kind: draft.kind,
    parentCategoryId: draft.parentCategoryId,
    iconKey: draft.iconKey.trim(),
    colorToken: draft.colorToken.trim(),
    lifecycle: draft.lifecycle,
    sortOrder: draft.sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  requireValid([
    ...validateCategoryDraft(draft),
    ...validateCategoryUniqueness(candidate, existing),
    ...validateCategoryHierarchy(candidate, existing),
  ]);

  return candidate;
}

export function prepareUpdatedCategory(
  current: Category,
  draft: CategoryDraft,
  existing: ReadonlyArray<Category>,
  now: ISOTimestamp,
): Category {
  const candidate: Category = {
    ...current,
    name: draft.name.trim().replace(/\s+/g, " "),
    kind: draft.kind,
    parentCategoryId: draft.parentCategoryId,
    iconKey: draft.iconKey.trim(),
    colorToken: draft.colorToken.trim(),
    lifecycle: draft.lifecycle,
    sortOrder: draft.sortOrder,
    updatedAt: now,
  };

  requireValid([
    ...validateCategoryDraft(draft),
    ...validateCategoryUniqueness(candidate, existing),
    ...validateCategoryHierarchy(candidate, existing),
  ]);

  return candidate;
}

export function prepareCategoryMerge(
  source: Category,
  target: Category,
  existing: ReadonlyArray<Category> = [],
) {
  requireValid(validateCategoryMerge(source, target, existing));
  return { sourceCategoryId: source.id, targetCategoryId: target.id } as const;
}

export function prepareCategoryReorder(
  existing: ReadonlyArray<Category>,
  orderedIds: ReadonlyArray<EntityId>,
) {
  requireValid(validateReorder(existing.map((category) => category.id), orderedIds));
  return [...orderedIds];
}
