import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getNetWorthOverview } from "@/lib/financial/net-worth";
import { NetWorthClient } from "./net-worth-client";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  await requireAuthorizedUser();
  const data = await getNetWorthOverview(18);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace nw-workspace">
    <header className="topbar"><div><p className="eyebrow">PATRIMONIO · {data.version}</p><h1>Patrimonio</h1><p>Activos, deudas y evolución patrimonial con cobertura histórica explícita y sin valores inventados.</p></div></header>
    <NetWorthClient initial={data}/>
  </section></main>;
}
