import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { NET_WORTH_SCOPE_DECISION } from "../../src/domain/product-scope-contract";

const models = readFileSync("src/domain/models.ts", "utf8");
const dashboard = readFileSync("app/dashboard-client.tsx", "utf8");
const balancesMigration = readFileSync(
  "supabase/migrations/20260905225858_phase5_scope_balances_by_account.sql",
  "utf8",
);

test("CR-005 · PRE-019 queda fuera de alcance del producto privado actual", () => {
  expect(NET_WORTH_SCOPE_DECISION.initiative).toBe("PRE-019");
  expect(NET_WORTH_SCOPE_DECISION.productScope).toBe("private_single_user");
  expect(NET_WORTH_SCOPE_DECISION.status).toBe("out_of_scope_current_release");
  expect(NET_WORTH_SCOPE_DECISION.decision).toBe("do_not_implement");
  expect(NET_WORTH_SCOPE_DECISION.currentFinancialMeaning.netWorth).toBe("not_available");
});

test("CR-005 · saldo agregado de cuentas no se presenta como patrimonio", () => {
  expect(balancesMigration).toContain("totalBalanceCents");
  expect(balancesMigration).toContain("activeBalanceCents");
  expect(balancesMigration.toLowerCase()).not.toContain("networth");
  expect(balancesMigration.toLowerCase()).not.toContain("net_worth");

  expect(dashboard).toContain("Saldo total en cuentas");
  expect(dashboard.toLowerCase()).not.toContain("patrimonio neto");
  expect(dashboard.toLowerCase()).not.toContain("net worth");
});

test("CR-005 · no se inventa un modelo patrimonial a partir de tipos de cuenta", () => {
  expect(models).toContain('  | "credit"');
  expect(models).toContain('  | "investment"');
  expect(models).not.toMatch(/export interface (Asset|Liability|NetWorthSnapshot)\b/);
  expect(NET_WORTH_SCOPE_DECISION.prohibitedShortcuts).toContain(
    "infer_assets_or_liabilities_from_account_type_only",
  );
  expect(NET_WORTH_SCOPE_DECISION.reconsiderOnlyWhen).toEqual(
    expect.arrayContaining([
      "explicit_asset_and_liability_model_exists",
      "valuation_source_and_date_are_traceable",
      "historical_net_worth_snapshots_are_defined",
      "account_inclusion_and_exclusion_semantics_are_defined",
    ]),
  );
});
