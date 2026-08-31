import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const failures=[];
const migration=read("database/FINANCIAL_APP_6.0.1_ARCHIVE_PAGINATION.sql");
const data=read("lib/financial/archive.ts");
const page=read("app/archivo/page.tsx");
const lifecycle=read("app/archivo/archive-lifecycle-client.tsx");
const activeClient=read("app/archivo/archive-client.tsx");
const css=read("app/archive-lifecycle.css");

for(const token of [
  "archive_document_pending_core",
  "archive_document_state_core",
  "archive_document_payload_core",
  "archive_lifecycle_overview_core",
  "financial_app_archive_lifecycle_overview",
  "grant execute on function public.financial_app_archive_lifecycle_overview",
  "v_query:=nullif(trim(coalesce(p_search,'')),'')",
  "count(*) filter(where state='new')",
  "count(*) filter(where state='pending')",
  "count(*) filter(where state='archived')"
])if(!migration.includes(token))failures.push(`Migración 6.0.1 incompleta: ${token}`);

for(const forbidden of [
  "update financial_app.documents",
  "delete from financial_app.documents",
  "insert into financial_app.documents",
  "update financial_app.transactions",
  "delete from financial_app.transactions"
])if(migration.toLowerCase().includes(forbidden))failures.push(`La migración de lectura no puede mutar datos financieros: ${forbidden}`);

for(const token of [
  "ArchiveLifecycleState",
  "ArchiveLifecycleCounts",
  "getArchiveLifecycleOverview",
  'financial_app_archive_lifecycle_overview',
  "offset+overview.documents.length<overview.total",
  'getArchiveLifecycleOverview("archived"'
])if(!data.includes(token))failures.push(`Contrato TypeScript de Archivo incompleto: ${token}`);

for(const token of [
  "PAGE_SIZE=40",
  "getArchiveLifecycleOverview(view,query||null,PAGE_SIZE,offset)",
  'activePromise=view==="new"?getArchiveOverview():Promise.resolve(null)',
  "lifecycle.counts.pending",
  "ARCHIVO · {lifecycle.version}",
  "Gestionar documentos activos",
  "totalPages"
])if(!page.includes(token))failures.push(`Página de Archivo no usa paginación/carga selectiva por estado: ${token}`);
if(page.includes("getArchivedDocuments"))failures.push("La página de Archivo no debe cargar el histórico completo para pintar una pestaña");
if(page.includes("const [active,lifecycle]=await Promise.all"))failures.push("Pendientes y Archivadas no deben volver a cargar la biblioteca activa de hasta 200 documentos");

for(const token of [
  'action="/archivo" method="get"',
  'name="q"',
  "counts.new",
  "counts.pending",
  "counts.archived",
  'view!=="new"',
  "archive-lifecycle-pagination",
  "Página {page} de {totalPages}"
])if(!lifecycle.includes(token))failures.push(`Cliente de ciclo documental sin estados/paginación o vuelve a duplicar Nuevas: ${token}`);
if(lifecycle.includes("useMemo"))failures.push("El ciclo documental no debe volver a filtrar páginas parciales en memoria");

for(const token of [
  'needsDocumentReview(document:ArchiveDetail)',
  'action:"archive"',
  '?action=archive',
  'router.refresh()',
  'Gestión documental activa'
])if(!activeClient.includes(token))failures.push(`Gestión activa de Archivo incompleta: ${token}`);
if(activeClient.includes('archived:"1"'))failures.push("El cliente activo no debe enviar el parámetro legado archived=1 que la API ignora desde v6");
if(activeClient.includes("Biblioteca única"))failures.push("Archivo no debe recuperar la leyenda heredada que contradice Nuevas/Pendientes/Archivadas");

for(const token of [".archive-lifecycle-pagination","min-height:44px","font-size:14px"])if(!css.includes(token))failures.push(`CSS de Archivo no protege legibilidad/táctil: ${token}`);

if(failures.length){console.error("Archive v6.0.1 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Archive v6.0.1 audit OK · estados server-side, carga selectiva, Nuevas sin lista duplicada y archivado seguro desde detalle protegidos");
