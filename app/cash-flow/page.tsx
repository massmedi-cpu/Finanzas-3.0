import AppShell from "../app-shell";
import { loadCashFlow } from "../../src/application/cash-flow/cash-flow-loader";
import { CashFlowClient } from "./cash-flow-client";

export const dynamic = "force-dynamic";

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : null;
  const view = await loadCashFlow(month);

  return <AppShell><CashFlowClient view={view} /></AppShell>;
}
