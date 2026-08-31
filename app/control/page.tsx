import { Suspense } from "react";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getControlCenter } from "@/lib/financial/control";
import { getDocumentMatchingCalibration } from "@/lib/financial/document-matching-calibration";
import { getDocumentMatchingDashboard } from "@/lib/financial/document-matching-dashboard";
import { getDocumentMatchingPolicyDashboard } from "@/lib/financial/document-matching-policy";
import { getSystemIntegrityOverview } from "@/lib/financial/integrity";
import { getMatchingObservability } from "@/lib/financial/matching-observability";
import { ControlClient } from "./control-client";
import { DocumentMatchingCalibrationPanel } from "./document-matching-calibration-panel";
import { DocumentMatchingPanel } from "./document-matching-panel";
import { DocumentMatchingPolicyPanel } from "./document-matching-policy-panel";
import { IntegrityPanel } from "./integrity-panel";
import { MatchingQualityPanel } from "./matching-quality-panel";

export const dynamic="force-dynamic";
const MONTH_RE=/^\d{4}-\d{2}$/;

type MatchingQualityData=Awaited<ReturnType<typeof getMatchingObservability>>;
type MatchingDashboardData=Awaited<ReturnType<typeof getDocumentMatchingDashboard>>;
type CalibrationData=Awaited<ReturnType<typeof getDocumentMatchingCalibration>>;
type PolicyData=Awaited<ReturnType<typeof getDocumentMatchingPolicyDashboard>>;
type IntegrityData=Awaited<ReturnType<typeof getSystemIntegrityOverview>>;

function ControlStreamFallback({title}:{title:string}){
  return <section className="control-panel" aria-busy="true" aria-label={`Cargando ${title}`}>
    <div className="control-panel-head"><div><p className="eyebrow">ACTUALIZANDO</p><h2>{title}</h2></div></div>
    <p className="muted-copy">Cargando este diagnóstico sin bloquear los avisos ni el cierre mensual.</p>
  </section>;
}

async function MatchingQualityStream({data}:{data:Promise<MatchingQualityData>}){return <MatchingQualityPanel data={await data}/>;}
async function DocumentMatchingStream({data}:{data:Promise<MatchingDashboardData>}){return <DocumentMatchingPanel dashboard={await data}/>;}
async function CalibrationStream({data}:{data:Promise<CalibrationData>}){return <DocumentMatchingCalibrationPanel data={await data}/>;}
async function PolicyStream({data}:{data:Promise<PolicyData>}){return <DocumentMatchingPolicyPanel data={await data}/>;}
async function IntegrityStream({data}:{data:Promise<IntegrityData>}){return <IntegrityPanel initialData={await data}/>;}

export default async function ControlPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const month=MONTH_RE.test(params.month||"")?params.month!:null;

  const controlPromise=getControlCenter(month);
  const matchingPromise=getMatchingObservability(90);
  const documentMatchingDashboard=getDocumentMatchingDashboard(8,90);
  const calibrationPromise=getDocumentMatchingCalibration(90);
  const policyPromise=getDocumentMatchingPolicyDashboard(90);
  const integrityPromise=getSystemIntegrityOverview();
  const data=await controlPromise;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace control-workspace">
    <header className="topbar"><div><p className="eyebrow">CENTRO DE CONTROL · {data.version}</p><h1>Control financiero</h1><p>Problemas reales, prioridades, cierre mensual, calidad de decisiones e integridad técnica sobre una única base de datos financiera.</p></div></header>
    <ControlClient initialData={data}/>
    <Suspense fallback={<ControlStreamFallback title="Calidad de asociaciones"/>}><MatchingQualityStream data={matchingPromise}/></Suspense>
    <Suspense fallback={<ControlStreamFallback title="Asociación de documentos"/>}><DocumentMatchingStream data={documentMatchingDashboard}/></Suspense>
    <Suspense fallback={<ControlStreamFallback title="Calibración documental"/>}><CalibrationStream data={calibrationPromise}/></Suspense>
    <Suspense fallback={<ControlStreamFallback title="Política de asociación"/>}><PolicyStream data={policyPromise}/></Suspense>
    <Suspense fallback={<ControlStreamFallback title="Integridad del sistema"/>}><IntegrityStream data={integrityPromise}/></Suspense>
  </section></main>;
}
