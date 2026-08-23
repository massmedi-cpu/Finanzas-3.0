import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getControlCenter } from "@/lib/financial/control";
import { getSystemIntegrityOverview } from "@/lib/financial/integrity";
import { ControlClient } from "./control-client";
import { IntegrityPanel } from "./integrity-panel";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;

export default async function ControlPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const month=MONTH_RE.test(params.month||"")?params.month!:null;
  const [data,integrity]=await Promise.all([getControlCenter(month),getSystemIntegrityOverview()]);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace control-workspace">
    <header className="topbar"><div><p className="eyebrow">CENTRO DE CONTROL · {data.version}</p><h1>Control financiero</h1><p>Problemas reales, prioridades, cierre mensual e integridad técnica sobre una única base de datos financiera.</p></div></header>
    <ControlClient initialData={data}/>
    <IntegrityPanel initialData={integrity}/>
  </section></main>;
}
