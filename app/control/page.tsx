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
type DiagnosticResult<T>={ok:true;data:T}|{ok:false;error:string};

function settleDiagnostic<T>(promise:Promise<T>):Promise<DiagnosticResult<T>>{
  return promise.then(
    data=>({ok:true,data}),
    error=>({ok:false,error:error instanceof Error?error.message:String(error||"diagnostic_unavailable")}),
  );
}

function ControlStreamFallback({title}:{title:string}){
  return <section className="control-panel" aria-busy="true" aria-label={`Cargando ${title}`}>
    <div className="control-panel-head"><div><p className="eyebrow">ACTUALIZANDO</p><h2>{title}</h2></div></div>
    <p className="muted-copy">Cargando este diagnóstico sin bloquear los avisos ni el cierre mensual.</p>
  </section>;
}

function DiagnosticUnavailable({title,error}:{title:string;error:string}){
  console.error(`[control] ${title} unavailable`,error);
  return <section className="control-panel" role="status" aria-label={`${title} no disponible`}>
    <div className="control-panel-head"><div><p className="eyebrow">DIAGNÓSTICO AISLADO</p><h2>{title}</h2></div></div>
    <p className="muted-copy">Este diagnóstico no está disponible temporalmente. El resto del Centro de control continúa operativo y puedes volver a cargar la página para reintentarlo.</p>
  </section>;
}

async function MatchingQualityStream({data}:{data:Promise<DiagnosticResult<MatchingQualityData>>}){const result=await data;return result.ok?<MatchingQualityPanel data={result.data}/>:<DiagnosticUnavailable title="Calidad de asociaciones" error={result.error}/>;}
async function DocumentMatchingStream({data}:{data:Promise<DiagnosticResult<MatchingDashboardData>>}){const result=await data;return result.ok?<DocumentMatchingPanel dashboard={result.data}/>:<DiagnosticUnavailable title="Asociación de documentos" error={result.error}/>;}
async function CalibrationStream({data}:{data:Promise<DiagnosticResult<CalibrationData>>}){const result=await data;return result.ok?<DocumentMatchingCalibrationPanel data={result.data}/>:<DiagnosticUnavailable title="Calibración documental" error={result.error}/>;}
async function PolicyStream({data}:{data:Promise<DiagnosticResult<PolicyData>>}){const result=await data;return result.ok?<DocumentMatchingPolicyPanel data={result.data}/>:<DiagnosticUnavailable title="Política de asociación" error={result.error}/>;}
async function IntegrityStream({data}:{data:Promise<DiagnosticResult<IntegrityData>>}){const result=await data;return result.ok?<IntegrityPanel initialData={result.data}/>:<DiagnosticUnavailable title="Integridad del sistema" error={result.error}/>;}

export default async function ControlPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireAuthorizedUser();
  const params=await searchParams;
  const month=MONTH_RE.test(params.month||"")?params.month!:null;

  const controlPromise=getControlCenter(month);
  const matchingPromise=settleDiagnostic(getMatchingObservability(90));
  const documentMatchingDashboard=settleDiagnostic(getDocumentMatchingDashboard(8,90));
  const calibrationPromise=settleDiagnostic(getDocumentMatchingCalibration(90));
  const policyPromise=settleDiagnostic(getDocumentMatchingPolicyDashboard(90));
  const integrityPromise=settleDiagnostic(getSystemIntegrityOverview());
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
