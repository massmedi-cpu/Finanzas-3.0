import fs from "node:fs";
import path from "node:path";

const roots=["app","components"];
const extensions=new Set([".ts",".tsx",".js",".mjs",".css"]);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(extensions.has(path.extname(entry.name)))files.push(full.replaceAll("\\","/"));}}
for(const root of roots)walk(root);

const failures=[];
const read=file=>fs.readFileSync(file,"utf8");

const localContracts=[
  {token:"text-button",clients:["app/reglas/rules-client.tsx"],css:"app/rules.css",selector:".rule-actions .text-button{",label:"Reglas"},
  {token:"text-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".text-button{",label:"Presupuesto"},
  {token:"danger-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".danger-button{",label:"Presupuesto"},
  {token:"text-button",clients:["app/control/control-client.tsx"],css:"app/control.css",selector:".text-link,.text-button{",label:"Control"},
  {token:"text-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".text-button{",label:"Objetivos"},
  {token:"danger-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".danger-button{",label:"Objetivos"},
];
for(const contract of localContracts){const css=read(contract.css);if(!css.includes(contract.selector))failures.push(`${contract.label} usa ${contract.token} sin estilo local propietario en ${contract.css}`);}
for(const token of ["text-button","danger-button"]){const allowed=new Set(localContracts.filter(contract=>contract.token===token).flatMap(contract=>[...contract.clients,contract.css]));for(const file of files){if(read(file).includes(token)&&!allowed.has(file))failures.push(`${file} usa ${token} sin contrato de propiedad declarado`);}}

const controls=read("app/controls.css");
for(const selector of [".primary-action{",".secondary-action,.ghost{",".ghost{",".danger-action{",".icon-button{",".button-link{display:inline-flex"]){if(!controls.includes(selector))failures.push(`Control canónico incompleto: falta ${selector}`);}
for(const token of ["min-height:44px","button:disabled","button[aria-busy=\"true\"]","var(--accent-primary)","var(--negative)"]){if(!controls.includes(token))failures.push(`Sistema de controles sin garantía premium: falta ${token}`);}
const iconRules=[...controls.matchAll(/\.icon-button\{([^}]*)\}/g)].map(match=>match[1]).join(";");
for(const token of ["border:","background:","color:","border-radius:","padding:"]){if(!iconRules.includes(token))failures.push(`icon-button canónico incompleto: falta ${token}`);}

const analysisDashboard=read("components/analysis-visual-dashboard.tsx");
const analysisPeriod=read("components/analysis-period-form.tsx");
for(const token of ['className="icon-button"','className="ghost"']){if(!analysisDashboard.includes(token))failures.push(`Análisis ha perdido control canónico: ${token}`);}
if(!analysisPeriod.includes('className="primary-action"'))failures.push("Selector de periodo ha perdido el botón primario canónico");
const explainability=read("app/explicabilidad/explainability-client.tsx");
for(const token of ['className="ghost"','className="primary-action"','Comprobar qué detectará','Activar para futuros']){if(!explainability.includes(token))failures.push(`Explicabilidad ha perdido el contrato de control/claridad: ${token}`);}

const chrome=read("app/chrome.css");
const navigation=read("components/app-navigation.tsx");
for(const token of [
  ".product-sidebar{","position:fixed",".product-primary-nav{",".product-more-menu{",
  ".product-more-groups{",".product-more-group h3{","overscroll-behavior:contain",
  "@media(max-width:980px)",".mobile-bottom-nav{","inset:auto 0 0 0","env(safe-area-inset-bottom,0px)","overflow-x:clip"
]){if(!chrome.includes(token))failures.push(`Shell adaptable incompleto: falta ${token}`);}
for(const token of [
  "mobile-bottom-nav","product-more-menu","Más",'aria-expanded={moreOpen}','aria-controls="product-more-menu"','aria-haspopup="dialog"','FinancialIcon',
  "secondaryGroups","Organizar","Planificar","Sistema","dialogRef","triggerRef","root.style.overflow=\"hidden\"",'event.key==="Tab"','event.key==="Escape"'
]){if(!navigation.includes(token))failures.push(`Navegación adaptable/premium incompleta: falta ${token}`);}
const requiredPrimary=['["Inicio","/","home"]','["Cash Flow","/cash-flow","cash-flow"]','["Movimientos","/movimientos","movements"]','["Análisis","/analisis","analysis"]','["Previsión","/prevision","forecast"]','["Archivo","/archivo","archive"]'];
let lastIndex=-1;
for(const token of requiredPrimary){const index=navigation.indexOf(token);if(index<0)failures.push(`Falta destino primario requerido: ${token}`);else if(index<=lastIndex)failures.push(`Orden primario incorrecto en ${token}`);lastIndex=index;}
if((navigation.match(/primary\.map/g)||[]).length<2)failures.push("Las seis secciones primarias deben alimentar sidebar y bottom navigation desde una única fuente de verdad");
if(!navigation.includes('role="dialog"')||!navigation.includes('aria-modal="true"')||!navigation.includes('aria-labelledby="product-more-title"'))failures.push("Más debe comportarse como superficie modal accesible, etiquetada y con foco contenido");
if(chrome.includes(".sidebar{")||navigation.includes("AppSidebar"))failures.push("El shell ha recuperado la sidebar SaaS retirada");

const homePage=read("app/page.tsx");
const cashFlowLayout=read("app/cash-flow/layout.tsx");
const cashFlowCss=read("app/cash-flow.css");
const sharedChartCss=read("app/cash-flow-chart.css");
if(homePage.includes('import "./cash-flow.css"'))failures.push("Inicio no debe cargar todos los estilos de la sección Cash Flow");
for(const token of ['import "./cash-flow-chart.css"','import "./home.css"'])if(!homePage.includes(token))failures.push(`Inicio ha perdido su límite CSS: ${token}`);
for(const token of ['import "../cash-flow.css"','import "../cash-flow-chart.css"'])if(!cashFlowLayout.includes(token))failures.push(`Cash Flow ha perdido sus estilos route-scoped/compartidos: ${token}`);
for(const token of [".cf-chart-wrap{",".cf-series-controls{",".cf-tooltip{",".cf-chart-data{"])if(!sharedChartCss.includes(token))failures.push(`La gráfica compartida ha perdido estilo canónico: ${token}`);
for(const token of [".cf-series-controls{",".cf-tooltip{",".cf-chart-data{"])if(cashFlowCss.includes(token))failures.push(`cash-flow.css vuelve a duplicar estilos compartidos: ${token}`);

const controlPage=read("app/control/page.tsx");
for(const token of [
  'import { Suspense } from "react"',
  "controlPromise=getControlCenter(month)",
  "settleDiagnostic(getMatchingObservability(90))",
  "settleDiagnostic(getDocumentMatchingDashboard(8,90))",
  "settleDiagnostic(getDocumentMatchingCalibration(90))",
  "settleDiagnostic(getDocumentMatchingPolicyDashboard(90))",
  "settleDiagnostic(getSystemIntegrityOverview())",
  "DiagnosticResult",
  "settleDiagnostic",
  "DiagnosticUnavailable",
  "ControlStreamFallback",
  "MatchingQualityStream",
  "DocumentMatchingStream",
  "CalibrationStream",
  "PolicyStream",
  "IntegrityStream",
]){if(!controlPage.includes(token))failures.push(`Centro de control ha perdido carga progresiva/aislamiento: ${token}`);}
if(controlPage.includes("await Promise.all(["))failures.push("Centro de control no debe volver a bloquear avisos y cierre mensual esperando todos los diagnósticos técnicos");

const controlSecurityMigration="database/FINANCIAL_APP_9.0.1_CONTROL_RPC_WRAPPERS.sql";
if(!fs.existsSync(controlSecurityMigration))failures.push(`Falta contrato de seguridad ${controlSecurityMigration}`);
else{
  const migration=read(controlSecurityMigration).toLowerCase();
  const wrappers=[
    "financial_app_archive_link_calibrated(uuid,text)",
    "financial_app_archive_unlink_calibrated(uuid,text)",
    "financial_app_document_matching_calibration(integer)",
    "financial_app_document_matching_observability(integer)",
    "financial_app_document_matching_policy_apply(bigint)",
    "financial_app_document_matching_policy_dashboard(integer)",
    "financial_app_document_matching_policy_generate(integer)",
    "financial_app_document_matching_policy_reject(bigint)",
    "financial_app_document_matching_policy_rollback()",
  ];
  for(const wrapper of wrappers){
    if(!migration.includes(`alter function public.${wrapper} security definer`))failures.push(`Wrapper público sin SECURITY DEFINER protegido: ${wrapper}`);
    if(!migration.includes(`revoke all on function public.${wrapper} from public, anon`))failures.push(`Wrapper público sin cierre explícito de anon/PUBLIC: ${wrapper}`);
    if(!migration.includes(`grant execute on function public.${wrapper} to authenticated, service_role`))failures.push(`Wrapper público sin roles autorizados explícitos: ${wrapper}`);
  }
  if(/grant\s+execute\s+on\s+function\s+financial_app\.[a-z0-9_]+_core/i.test(migration))failures.push("La reparación de Control no puede reabrir funciones privadas *_core");
}

if(failures.length){console.error("Control usage audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Control usage audit OK · controles premium, shell responsive, menú modal agrupado, CSS compartido delimitado, diagnósticos aislados y wrappers RPC protegidos");
