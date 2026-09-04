import { formatDate } from "./formatters";
import { formatMoneyCents, parseSpanishMoneyToCents } from "./money";
import { REGIONAL_CONFIG } from "./regional";
import { prepareNewAccount, prepareUpdatedCategory } from "../application/configuration-commands";
import { validateAccountDraft, validateCategoryDraft } from "../domain/configuration";
import {
  validateAccountUniqueness,
  validateCategoryHierarchy,
  validateCategoryMerge,
  validateCategoryUniqueness,
  validateReorder,
} from "../domain/configuration-policies";
import { resolveEffectiveTransaction } from "../domain/effective-transaction";
import { FINANCIAL_INVARIANTS } from "../domain/invariants";
import type { Account, Category, Transaction, TransactionOverride } from "../domain/models";
import { buildSourceFingerprint, buildSourceRowIdentity } from "../domain/source-identity";
import { planSourceObservation } from "../domain/source-sync-plan";

export type FoundationCheck = {
  name: string;
  passed: boolean;
};

export type FoundationHealth = {
  status: "ok" | "failed";
  passed: number;
  total: number;
  checks: FoundationCheck[];
};

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0|\u202f/g, " ");
}

function throws(callback: () => unknown) {
  try {
    callback();
    return false;
  } catch {
    return true;
  }
}

export function runFoundationHealthChecks(): FoundationHealth {
  const transaction: Transaction = {
    id: "tx-validation",
    sourceRecordId: "source-validation",
    sourceRowIdentity: "bank-sheet::movements::row-42",
    accountId: "account-validation",
    bankDate: "2026-09-03",
    conceptNormalized: "Concepto original procesado",
    merchantId: "merchant-original",
    categoryId: "category-original",
    kind: "expense",
    amountCents: -1234,
    balanceAfterCents: 500000,
    reviewState: "pending",
    duplicateState: "none",
    transferPairId: null,
    createdAt: "2026-09-03T10:00:00Z",
    updatedAt: "2026-09-03T10:00:00Z",
  };

  const override: TransactionOverride = {
    id: "override-validation",
    transactionId: transaction.id,
    conceptOverride: "Concepto corregido por el usuario",
    merchantIdOverride: null,
    categoryIdOverride: "category-validation",
    kindOverride: null,
    excludedFromAnalytics: false,
    reviewStateOverride: "confirmed",
    note: "Validación",
    createdAt: "2026-09-03T10:00:00Z",
    updatedAt: "2026-09-03T10:00:00Z",
  };

  const clearOverride: TransactionOverride = {
    ...override,
    id: "override-clear-validation",
    conceptOverride: null,
    merchantIdOverride: null,
    merchantOverrideSet: true,
    categoryIdOverride: null,
    categoryOverrideSet: true,
    reviewStateOverride: null,
    note: null,
  };

  const transactionBefore = JSON.stringify(transaction);
  const effective = resolveEffectiveTransaction(transaction, override);
  const effectiveCleared = resolveEffectiveTransaction(transaction, clearOverride);

  const sourceIdentityInput = {
    sourceFileId: "bank-sheet",
    sourceSheetId: "movements",
    sourceRowKey: "row-42",
    bankDate: "2026-09-03",
    conceptOriginal: "  COMPRA   SUPERMERCADO  ",
    amountCents: -2599,
    balanceAfterCents: 145001,
    accountExternalKey: "Cuenta principal",
  } as const;

  const sourceRowIdentity = buildSourceRowIdentity(sourceIdentityInput);
  const sourceFingerprint = buildSourceFingerprint(sourceIdentityInput);
  const firstObservation = planSourceObservation(sourceIdentityInput, null);
  const repeatedObservation = planSourceObservation(sourceIdentityInput, {
    id: "source-snapshot-1",
    sourceRowIdentity,
    sourceFingerprint,
  });
  const correctedObservation = planSourceObservation(
    { ...sourceIdentityInput, amountCents: -2600 },
    {
      id: "source-snapshot-1",
      sourceRowIdentity,
      sourceFingerprint,
    },
  );

  const accountExisting: Account = {
    id: "account-existing",
    name: "Ahorro",
    institution: "Banco",
    type: "savings",
    openingBalanceCents: 0,
    currency: "EUR",
    lifecycle: "active",
    sortOrder: 0,
    createdAt: "2026-09-03T10:00:00Z",
    updatedAt: "2026-09-03T10:00:00Z",
  };

  const preparedAccount = prepareNewAccount(
    {
      name: "  Cuenta   principal ",
      institution: " Banco  Demo ",
      type: "checking",
      openingBalanceCents: 123456,
      lifecycle: "active",
      sortOrder: 1,
    },
    [accountExisting],
    "account-new",
    "2026-09-03T11:00:00Z",
  );

  const categoryA: Category = {
    id: "category-a",
    name: "Hogar",
    kind: "expense",
    parentCategoryId: null,
    iconKey: "home",
    colorToken: "category.home",
    lifecycle: "active",
    sortOrder: 0,
    createdAt: "2026-09-03T10:00:00Z",
    updatedAt: "2026-09-03T10:00:00Z",
  };

  const categoryB: Category = {
    ...categoryA,
    id: "category-b",
    name: "Suministros",
    parentCategoryId: categoryA.id,
    sortOrder: 1,
  };

  const preparedCategory = prepareUpdatedCategory(
    categoryB,
    {
      name: "  Suministros   hogar ",
      kind: "expense",
      parentCategoryId: categoryA.id,
      iconKey: " utilities ",
      colorToken: " category.utilities ",
      lifecycle: "active",
      sortOrder: 1,
    },
    [categoryA, categoryB],
    "2026-09-03T11:00:00Z",
  );

  const checks: FoundationCheck[] = [
    {
      name: "locale-es-ES",
      passed:
        REGIONAL_CONFIG.locale === "es-ES" &&
        REGIONAL_CONFIG.currency === "EUR" &&
        REGIONAL_CONFIG.timeZone === "Europe/Madrid",
    },
    {
      name: "parse-money-es-ES",
      passed:
        parseSpanishMoneyToCents("1.234.567,89 €") === 123456789 &&
        parseSpanishMoneyToCents("-0,09 €") === -9,
    },
    {
      name: "reject-invalid-money",
      passed:
        throws(() => parseSpanishMoneyToCents("1,234.56 €")) &&
        throws(() => parseSpanishMoneyToCents("12,345 €")),
    },
    {
      name: "format-money-two-decimals",
      passed:
        normalizeSpaces(formatMoneyCents(123456789)) === "1.234.567,89 €" &&
        normalizeSpaces(formatMoneyCents(123456)) === "1.234,56 €" &&
        normalizeSpaces(formatMoneyCents(100)) === "1,00 €" &&
        normalizeSpaces(formatMoneyCents(-9)) === "-0,09 €",
    },
    {
      name: "date-europe-madrid",
      passed: formatDate("2026-09-03T12:00:00Z") === "03/09/2026",
    },
    {
      name: "bank-source-read-only-invariant",
      passed:
        FINANCIAL_INVARIANTS.bankSource.mutable === false &&
        FINANCIAL_INVARIANTS.synchronization.writesToSource === false &&
        FINANCIAL_INVARIANTS.synchronization.idempotent === true,
    },
    {
      name: "source-row-identity-stable",
      passed:
        sourceRowIdentity === "bank-sheet::movements::row-42" &&
        sourceFingerprint === buildSourceFingerprint(sourceIdentityInput) &&
        sourceFingerprint !== buildSourceFingerprint({ ...sourceIdentityInput, amountCents: -2600 }),
    },
    {
      name: "source-sync-idempotent",
      passed:
        firstObservation.action === "insert" &&
        repeatedObservation.action === "skip" &&
        repeatedObservation.existingSourceRecordId === "source-snapshot-1",
    },
    {
      name: "source-correction-appends-immutable-revision",
      passed:
        correctedObservation.action === "append_revision" &&
        correctedObservation.supersedesSourceRecordId === "source-snapshot-1" &&
        correctedObservation.sourceFingerprint !== sourceFingerprint,
    },
    {
      name: "user-override-projection-is-non-destructive",
      passed:
        effective.concept === "Concepto corregido por el usuario" &&
        effective.merchantId === transaction.merchantId &&
        effective.categoryId === "category-validation" &&
        effective.reviewState === "confirmed" &&
        effective.amountCents === transaction.amountCents &&
        JSON.stringify(transaction) === transactionBefore,
    },
    {
      name: "user-can-explicitly-clear-derived-values",
      passed: effectiveCleared.merchantId === null && effectiveCleared.categoryId === null,
    },
    {
      name: "account-validation",
      passed:
        validateAccountDraft({
          name: "Cuenta de validación",
          institution: null,
          type: "checking",
          openingBalanceCents: 123456,
          lifecycle: "active",
          sortOrder: 0,
        }).length === 0,
    },
    {
      name: "account-name-uniqueness",
      passed:
        validateAccountUniqueness(
          { id: "account-new", name: "  CUENTA principal " },
          [{ id: "account-existing", name: "Cuenta principal" }],
        ).some((issue) => issue.code === "duplicate_account_name"),
    },
    {
      name: "account-command-normalization",
      passed:
        preparedAccount.name === "Cuenta principal" &&
        preparedAccount.institution === "Banco Demo" &&
        preparedAccount.currency === "EUR" &&
        preparedAccount.createdAt === preparedAccount.updatedAt,
    },
    {
      name: "category-validation",
      passed:
        validateCategoryDraft({
          name: "Categoría de validación",
          kind: "expense",
          parentCategoryId: null,
          iconKey: "validation",
          colorToken: "category.validation",
          lifecycle: "active",
          sortOrder: 0,
        }).length === 0,
    },
    {
      name: "category-name-uniqueness-per-level",
      passed:
        validateCategoryUniqueness(
          { ...categoryB, id: "category-new", name: " suministros " },
          [categoryA, categoryB],
        ).some((issue) => issue.code === "duplicate_category_name"),
    },
    {
      name: "category-hierarchy-cycle-protection",
      passed:
        validateCategoryHierarchy(
          { ...categoryA, parentCategoryId: categoryB.id },
          [categoryA, categoryB],
        ).some((issue) => issue.code === "category_cycle"),
    },
    {
      name: "category-merge-descendant-protection",
      passed: validateCategoryMerge(categoryA, categoryB, [categoryA, categoryB]).some(
        (issue) => issue.code === "merge_into_descendant",
      ),
    },
    {
      name: "category-command-normalization",
      passed:
        preparedCategory.name === "Suministros hogar" &&
        preparedCategory.iconKey === "utilities" &&
        preparedCategory.colorToken === "category.utilities" &&
        preparedCategory.createdAt === categoryB.createdAt &&
        preparedCategory.updatedAt === "2026-09-03T11:00:00Z",
    },
    {
      name: "reorder-set-integrity",
      passed:
        validateReorder(["a", "b", "c"], ["c", "a", "b"]).length === 0 &&
        validateReorder(["a", "b", "c"], ["a", "a", "c"]).some(
          (issue) => issue.code === "invalid_reorder_set",
        ),
    },
  ];

  const passed = checks.filter((check) => check.passed).length;

  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
