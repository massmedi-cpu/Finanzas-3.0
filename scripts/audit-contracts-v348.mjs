import fs from "node:fs";
import path from "node:path";

const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};
const read=file=>fs.readFileSync(file,"utf8");
const runtime=[];
for(const root of ["app","components","lib"]){
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(?:ts|tsx|js|mjs)$/.test(entry.name))runtime.push(full);}};
  walk(root);
}

for(const file of runtime){
  const source=read(file);
  must(!/\.rpc\(\s*["']financial_app_movements["']/.test(source),`RPC básico de movimientos retirado vuelve a usarse en ${file}`);
}

const movementsApi=read("app/api/movements/route.ts");
must(movementsApi.includes('supabase.rpc("financial_app_movements_advanced"'),"Movimientos debe usar exclusivamente el contrato avanzado canónico");

const settingsApi=read("app/api/settings/route.ts");
must(settingsApi.includes('p_timezone:timezone'),"Configuración debe persistir la zona horaria mediante la firma canónica");
must(!/\bp_settings\s*:/.test(settingsApi),"Configuración no debe recuperar la firma obsoleta theme + settings JSON");

const migrationPath="database/FINANCIAL_APP_3.4.8_RETIRE_OBSOLETE_RPCS.sql";
must(fs.existsSync(migrationPath),"Falta la migración 3.4.8 que retira contratos obsoletos");
if(fs.existsSync(migrationPath)){
  const migration=read(migrationPath);
  for(const token of [
    "drop function if exists public.financial_app_movements(integer,integer,text,uuid,text,text,boolean,date,date,numeric,numeric,text) restrict",
    "drop function if exists financial_app.movements_rpc(integer,integer,text,uuid,text,text,boolean,date,date,numeric,numeric,text) restrict",
    "drop function if exists public.financial_app_settings_update(text,jsonb) restrict",
    "drop function if exists financial_app.settings_update_core(text,jsonb) restrict",
    "'app_version',to_jsonb('3.4.8'::text)"
  ]) must(migration.includes(token),`La retirada 3.4.8 ha perdido la garantía: ${token}`);
}

if(failures.length){console.error("RPC contract audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("RPC contract audit OK · movimientos avanzado y configuración theme+timezone son los únicos contratos runtime canónicos");
