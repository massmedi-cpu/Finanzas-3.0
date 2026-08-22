import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getControlCenter } from "@/lib/financial/control";
import { AppSidebar } from "@/components/app-sidebar";
import { ControlClient } from "./control-client";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;

export default async function ControlPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const month=MONTH_RE.test(params.month||"")?params.month!:null;
  const data=await getControlCenter(month);
  return <main className="app-shell"><AppSidebar active="/control" status="Control financiero · alertas y cierre mensual"/><section id="main-content" tabIndex={-1} className="workspace control-workspace">
    <header className="topbar"><div><p className="eyebrow">CENTRO DE CONTROL · {data.version}</p><h1>Control financiero</h1><p>Problemas reales, prioridades y cierre mensual sobre las mismas reglas que Cash Flow, Presupuesto y Conciliación.</p></div></header>
    <ControlClient initialData={data}/>
  </section></main>;
}
