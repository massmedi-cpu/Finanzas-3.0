import { formatDate } from "./formatters";
import { formatMoneyCents, parseSpanishMoneyToCents } from "./money";
import { REGIONAL_CONFIG } from "./regional";
import { validateAccountDraft, validateCategoryDraft } from "../domain/configuration";
import {
  validateAccountUniqueness,
  validateCategoryHierarchy,
  validateCategoryUniqueness,
  validateReorder,
} from "../domain/configuration-policies";
import { resolveEffectiveTransaction } from "../domain/effective-transaction";
import { FINANCIAL_INVARIANTS } from "../domain/invariants";
import type { Category, Transaction, TransactionOverride } from "../domain/models";
import { buildSourceFingerprint, buildSourceRowIdentity } from "../domain/source-identity";

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
        buildSourceRowIdentity(sourceIdentityInput) === "bank-sheet::movements::row-42" &&
        buildSourceFingerprint(sourceIdentityInput) === buildSourceFingerprint(sourceIdentityInput) &&
        buildSourceFingerprint(sourceIdentityInput) !==
          buildSourceFingerprint({ ...sourceIdentityInput, amountCents: -2600 }),
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
