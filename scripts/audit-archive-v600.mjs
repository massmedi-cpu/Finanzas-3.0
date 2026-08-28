import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const failures=[];
const page=read("app/archivo/page.tsx");
const lifecycle=read("app/archivo/archive-lifecycle-client.tsx");
const api=read("app/api/archive/route.ts");
const detailApi=read("app/api/archive/[id]/route.ts");
const data=read("lib/financial/archive.ts");
const migration=read("database/FINANCIAL_APP_6.0.0_ARCHIVE_EXISTING_DOCUMENTS.sql");
const layout=read("app/archivo/layout.tsx");

for(const token of ["getArchiveOverview","getArchivedDocuments","ArchiveLifecycleClient",'view==="new"','view==="pending"','view==="archived"'])if(!page.includes(token))failures.push(`Archivo ha perdido su ciclo documental: ${token}`);
for(const token of [">Nuevas<",">Pendientes<",">Archivadas<","Archivar","Desarchivar",'action:"archive"|"restore"','router.refresh()'])if(!lifecycle.includes(token))failures.push(`Ciclo documental incompleto: ${token}`);
for(const token of ['fill="none"','className="financial-icon"','status-badge'])if(!lifecycle.includes(token))failures.push(`Iconografía/estado documental incompleto: ${token}`);
for(const token of ['getArchiveOverview','archiveOverview(search,false)','getArchivedDocuments','Boolean(document.archivedAt)','archiveOverviewAllPages','while(offset<first.total)','archiveOverviewAllPages(null,false)'])if(!data.includes(token))failures.push(`Consulta documental sin separación/paginación completa: ${token}`);
if(!api.includes('request.nextUrl.searchParams.get("includeArchived") === "1"'))failures.push("La API de Archivo debe excluir archivados por defecto y exigir includeArchived=1 explícito");
if(api.includes('searchParams.get("archived") !== "0"'))failures.push("La API ha recuperado el flag ambiguo archived de versiones anteriores");
for(const token of ['action==="archive"','financial_app_archive_archive','action==="restore"','financial_app_archive_restore'])if(!detailApi.includes(token))failures.push(`Endpoint reversible de Archivo incompleto: ${token}`);
for(const token of [
  "where d.archived_at is null",
  "d.created_at <= timestamptz '2026-08-28 05:14:26.813505+00'",
  "set archived_at = timestamptz '2026-08-28 05:14:26.813505+00'",
  "insert into financial_app.document_history",
  "'archive_v6_migration'",
  "'system:financial-app-6.0.0'"
])if(!migration.includes(token))failures.push(`Migración 6.0.0 no protege el contrato idempotente: ${token}`);
if(!layout.includes('import "../archive-lifecycle.css";'))failures.push("Archivo debe cargar su hoja propietaria de ciclo documental");

if(failures.length){console.error("Archive v6 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Archive v6 audit OK · Nuevas/Pendientes/Archivadas separados, histórico reversible, paginación completa y migración idempotente protegidos");
