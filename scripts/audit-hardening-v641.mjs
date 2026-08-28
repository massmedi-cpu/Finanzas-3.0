import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.1_MATCHING_POLICY_INDEX.sql");
const axioms=read("docs/PROJECT_AXIOMS.md");
const architecture=read("docs/CANONICAL_ARCHITECTURE.md");

for(const token of [
  "document_matching_policies_supersedes_policy_id_idx",
  "financial_app.document_matching_policies(supersedes_policy_id)",
  "create index if not exists",
  "financial_app_6_4_1_matching_policy_index_missing"
])must(migration.toLowerCase().includes(token.toLowerCase()),`Hardening 6.4.1 incompleto: ${token}`);

for(const forbidden of [
  "update financial_app.transactions",
  "delete from financial_app.transactions",
  "insert into financial_app.transactions",
  "update financial_app.documents",
  "delete from financial_app.documents",
  "insert into financial_app.documents",
  "update financial_app.document_matching_policies",
  "delete from financial_app.document_matching_policies"
])must(!migration.toLowerCase().includes(forbidden),`La migración de índice no puede mutar datos: ${forbidden}`);

must(!axioms.includes("preview → validación → producción"),"Los axiomas no pueden volver a exigir previews automáticas");
must(!axioms.includes("Las RPC privilegiadas no pueden ser ejecutables por `anon` ni `authenticated`."),"Los axiomas no pueden recuperar el modelo RPC anterior a 6.4");
for(const token of ["previews automáticas","SECURITY INVOKER","authorized_email()","`anon` no puede ejecutar operaciones financieras privilegiadas","índices se añaden o retiran por relaciones, consultas y métricas observadas"])
  must(axioms.includes(token),`Axioma 6.4.1 ausente: ${token}`);

must(!architecture.includes("Preview del mismo SHA validado."),"La arquitectura no puede volver a exigir una preview automática");
for(const token of ["Financial App — Arquitectura canónica vigente","Centro de operaciones documentales 6.4","SECURITY INVOKER","authorized_email()","Deployment Vercel `READY`","Production smoke"])
  must(architecture.includes(token),`Arquitectura canónica 6.4.1 incompleta: ${token}`);

if(failures.length){console.error("Financial App 6.4.1 hardening audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.1 hardening audit OK · FK indexada, cero mutación financiera y contratos de seguridad/publicación alineados");
