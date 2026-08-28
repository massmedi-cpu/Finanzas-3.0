import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getControlCenter } from "@/lib/financial/control";
import { getDocumentMatchingObservability } from "@/lib/financial/document-matching-observability";
import { getSystemIntegrityOverview } from "@/lib/financial/integrity";
import { getMatchingObservability } from "@/lib/financial/matching-observability";
import { ControlClient } from "./control-client";
import { DocumentMatchingPanel } from "./document-matching-panel";
import { IntegrityPanel } from "./integrity-panel";
import { MatchingQualityPanel } from "./matching-quality-panel";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;

export default async function ControlPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const month=MONTH_RE.test(params.month||"")?params.month!:null;
  const [data,matching,documentMatching,integrity]=await Promise.all([
    getControlCenter(month),
    getMatchingObservability(90),
    getDocumentMatchingObservability(8),
    getSystemIntegrityOverview(),
  ]);
  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace control-workspace">
    <header className="topbar"><div><p className="eyebrow">CENTRO DE CONTROL · {data.version}</p><h1>Control financiero</h1><p>Problemas reales, prioridades, cierre mensual, calidad de decisiones e integridad técnica sobre una única base de datos financiera.</p></div></header>
    <ControlClient initialData={data}/>
    <MatchingQualityPanel data={matching}/>
    <DocumentMatchingPanel data={documentMatching}/>
    <IntegrityPanel initialData={integrity}/>
  </section></main>;
}
