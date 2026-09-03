import { NextResponse } from "next/server";
import { formatDate } from "../../../../src/core/formatters";
import { formatMoneyCents, parseSpanishMoneyToCents } from "../../../../src/core/money";
import { REGIONAL_CONFIG } from "../../../../src/core/regional";
import { validateAccountDraft, validateCategoryDraft } from "../../../../src/domain/configuration";
import { FINANCIAL_INVARIANTS } from "../../../../src/domain/invariants";

export const dynamic = "force-dynamic";

type FoundationCheck = {
  name: string;
  passed: boolean;
};

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0|\u202f/g, " ");
}

export function GET() {
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
  ];

  const passed = checks.every((check) => check.passed);

  return NextResponse.json(
    {
      status: passed ? "ok" : "failed",
      checks,
    },
    {
      status: passed ? 200 : 500,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
