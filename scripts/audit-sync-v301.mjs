import { readFileSync } from "node:fs";

const errors=[];
const read=(path)=>readFileSync(path,"utf8");
const button=read("components/sync-button.tsx");
const route=read("app/api/sync/route.ts");

if(!button.includes('fetch("/api/sync"')) errors.push("SyncButton debe usar la ruta same-origin /api/sync");
if(button.includes("supabase.functions.invoke")) errors.push("SyncButton no debe invocar Edge Functions directamente desde el navegador");
if(!route.includes("supabase.auth.getUser()")) errors.push("La ruta de sync debe validar la sesión en servidor");
if(!route.includes("hasFinancialAppAccess")) errors.push("La ruta de sync debe conservar la allowlist de Financial App");
if(!route.includes("/functions/v1/financial-app-sync")) errors.push("La ruta de sync debe delegar en financial-app-sync");
if(!route.includes("authorization: `Bearer ${accessToken}`")) errors.push("La ruta debe reenviar el JWT autenticado, no service role");
if(route.includes("SUPABASE_SERVICE_ROLE_KEY")) errors.push("La ruta de navegador no puede usar service role");
if(!route.includes('cache: "no-store"')) errors.push("La sincronización no puede cachearse");

if(errors.length){
  console.error("Financial App sync regression audit FAILED");
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Financial App sync audit OK · proxy same-origin, sesión, allowlist y no-store protegidos");
