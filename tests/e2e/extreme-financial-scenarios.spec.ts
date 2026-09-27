import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

const phase5 = source("supabase/migrations/20260905225500_phase5_financial_logic_core.sql");
const home = source("app/inicio-overview.tsx");

test("10.0.24 evita divisiones artificiales cuando el periodo no tiene ingresos", () => {
  expect(phase5).toContain("'savingsRateBps',case when m.income_cents>0 then round((m.operating_net_cents::numeric*10000)/m.income_cents)::int else null end");
  expect(phase5).toContain("coalesce(sum(amount_cents) filter (where effective_kind='income'),0)::bigint as income_cents");
});

test("10.0.24 representa meses sin gastos y periodos vacíos con ceros explícitos", () => {
  expect(phase5).toContain("coalesce(-sum(amount_cents) filter (where effective_kind='expense'),0)::bigint as expense_cents");
  expect(phase5).toContain("select generate_series(date_trunc('month',v_date_from::timestamp),date_trunc('month',v_date_to::timestamp),interval '1 month')::date as month_start");
  expect(phase5).toContain("'rows',coalesce(g.rows,0)");
  expect(phase5).toContain("'incomeCents',coalesce(g.income_cents,0)");
  expect(phase5).toContain("'expenseCents',coalesce(g.expense_cents,0)");
  expect(phase5).toContain("'operatingNetCents',coalesce(g.operating_net_cents,0)");
});

test("10.0.24 excluye transferencias del resultado operativo sin ocultar su trazabilidad", () => {
  expect(phase5).toContain("coalesce(sum(amount_cents) filter (where effective_kind<>'transfer'),0)::bigint as operating_net_cents");
  expect(phase5).toContain("coalesce(sum(amount_cents) filter (where effective_kind='transfer'),0)::bigint as transfer_net_cents");
  expect(phase5).toContain("coalesce(sum(abs(amount_cents)) filter (where effective_kind='transfer'),0)::bigint as transfer_gross_cents");
  expect(phase5).toContain("'transfersExcludedFromSavings',true");
});

test("10.0.24 conserva devoluciones como hecho financiero y las incorpora al neto operativo", () => {
  expect(phase5).toContain("coalesce(sum(amount_cents) filter (where effective_kind='refund'),0)::bigint as refund_cents");
  expect(phase5).toContain("coalesce(sum(amount_cents) filter (where effective_kind<>'transfer'),0)::bigint as operating_net_cents");
  expect(phase5).toContain("'refundCents',m.refund_cents");
});

test("10.0.24 detecta signos incompatibles sin reescribir el movimiento bancario", () => {
  expect(phase5).toContain("financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id)='income' and t.amount_cents<0");
  expect(phase5).toContain("financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id)='expense' and t.amount_cents>0");
  expect(phase5).toContain("count(*) filter (where sign_mismatch)::int as sign_mismatch_count");
  expect(phase5).toContain("'signMismatchRows',m.sign_mismatch_count");

  expect(home).toContain("const signMismatchRows = financial?.period.quality.signMismatchRows ?? 0;");
  expect(home).toContain("movimiento con signo incoherente");
  expect(home).toContain("No hemos corregido el importe automáticamente.");
  expect(home).toContain('href: "/transactions?signMismatch=true"');
});
