import fs from "node:fs";
import path from "node:path";

const failures=[];
const warnings=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};
const warn=(condition,message)=>{if(!condition)warnings.push(message)};
const read=file=>fs.readFileSync(file,"utf8");
const walk=(root)=>{
  const out=[];
  if(!fs.existsSync(root))return out;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else out.push(full.replaceAll("\\","/"));
  }
  return out;
};

const runtimeFiles=[...walk("app"),...walk("components"),...walk("lib")].filter(file=>/\.(?:ts|tsx|js|mjs|css)$/.test(file));
const codeFiles=runtimeFiles.filter(file=>/\.(?:ts|tsx|js|mjs)$/.test(file));
const packageJson=JSON.parse(read("package.json"));
const lock=JSON.parse(read("package-lock.json"));
const appVersionSource=read("lib/app-version.ts");
const versionMatch=appVersionSource.match(/APP_VERSION\s*=\s*"([^"]+)"/);
const appVersion=versionMatch?.[1]??null;

must(Boolean(appVersion)&&/^\d+\.\d+\.\d+$/.test(appVersion||""),"lib/app-version.ts no expone APP_VERSION semántica explícita");
// package.json identifica el paquete técnico instalado; APP_VERSION identifica el producto visible.
// La única obligación del paquete es permanecer coherente con su lock. Nunca puede alimentar UI/PWA.
must(lock.version===packageJson.version,"package-lock.version no coincide con package.json");
must(lock.packages?.[""]?.version===packageJson.version,"package-lock root package no coincide con package.json");
const documentPrep=read("scripts/prepare-document-engine.mjs");
must(documentPrep.includes("lib\",\"app-version.ts")&&documentPrep.includes("const appVersion=versionMatch[1]"),"El manifiesto documental debe derivar su versión de APP_VERSION, no de package.json");
must(!documentPrep.includes("appVersion: packageJson.version"),"package.json no puede volver a ser fuente de versión visible");

for(const file of runtimeFiles){
  const base=path.basename(file);
  must(!/-v\d+(?:\.\d+)*(?=\.)/i.test(base),`Archivo runtime arrastrado/versionado: ${file}`);
  if(/\.(?:ts|tsx|js|mjs)$/.test(file)){
    const source=read(file);
    must(!/(?:^|\n)\s*(?:\/\/|\/\*|\*)\s*(?:TODO|FIXME|WIP)\b/i.test(source),`Trabajo incompleto en runtime: ${file}`);
    must(!/catch\s*(?:\([^)]*\))?\s*\{\s*\}/m.test(source),`catch vacío en runtime: ${file}`);
    const versionedRpcCalls=source.match(/\.rpc\(\s*["'][^"']*_v\d+(?:[._-]?\d+)*["']/gi)||[];
    must(versionedRpcCalls.length===0,`RPC runtime versionado/arrastrado en ${file}: ${[...new Set(versionedRpcCalls)].join(", ")}`);
  }
}

for(const file of codeFiles.filter(file=>file.startsWith("lib/financial/")||file.startsWith("app/api/"))){
  const source=read(file);
  const explicitAny=(source.match(/\b(?:as\s+any|:\s*any\b|<any>)/g)||[]).length;
  must(explicitAny===0,`Tipado any en capa financiera/API (${explicitAny}): ${file}`);
}

const financialSources=codeFiles.filter(file=>file.startsWith("lib/financial/")).map(file=>[file,read(file)]);
for(const [file,source] of financialSources){
  const hardcodedVersions=source.match(/["']\d+\.\d+\.\d+["']/g)||[];
  must(hardcodedVersions.length===0,`Versión histórica hardcodeada en dominio financiero ${file}: ${[...new Set(hardcodedVersions)].join(", ")}`);
}

const authHelper=read("lib/auth/authorized-client.ts");
must(authHelper.includes("hasFinancialAppAccess")&&authHelper.includes("supabase.auth.getUser()"),"La autorización API canónica debe validar sesión y lista de acceso");
for(const file of codeFiles.filter(file=>file.startsWith("app/api/"))){
  const source=read(file);
  if(source.includes("createClient()")&&source.includes("auth.getUser()"))warn(source.includes("getAuthorizedClient"),`API con autorización local duplicada: ${file}`);
}

const ci=read(".github/workflows/ci.yml");
must(!/develop\/v\d|hotfix\/v\d|financial-app-rebuild/.test(ci),"CI acoplado a ramas históricas concretas");
const releaseScript=String(packageJson.scripts?.["audit:release"]||"");
const prebuildScript=String(packageJson.scripts?.prebuild||"");
must(releaseScript.includes("audit:axioma")&&prebuildScript.includes("audit:release")&&ci.includes("npm run build"),"CI/build no encadenan el gate AXIOMA total mediante audit:release");

const packageText=read("package.json");
const allRepoCode=[...walk("scripts"),...runtimeFiles].filter(file=>/\.(?:ts|tsx|js|mjs)$/.test(file));
const referencedText=[packageText,ci,...allRepoCode.map(read)].join("\n");
const staleCandidates=["check-project-invariants.mjs","run-domain-tests.mjs","source-multisheet-invariant-tests.mjs"];
for(const name of staleCandidates){
  const file=`scripts/${name}`;
  if(!fs.existsSync(file))continue;
  const occurrences=(referencedText.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length;
  warn(occurrences>1,`Script sin integración verificable/candidato a arqueología: ${file}`);
}

const secretPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/,/GOOGLE_CLIENT_SECRET\s*=\s*[^$\s]/];
for(const file of codeFiles){const source=read(file);for(const pattern of secretPatterns)must(!pattern.test(source),`Posible secreto incrustado: ${file}`);}

if(warnings.length){console.warn("AXIOMA total audit warnings:");for(const item of warnings)console.warn(`- ${item}`);}
if(failures.length){console.error("AXIOMA total audit FAILED:");for(const item of failures)console.error(`- ${item}`);process.exit(1);}
console.log(`AXIOMA total audit OK · ${runtimeFiles.length} archivos runtime inspeccionados · APP_VERSION canónica, deuda histórica, RPC, autorización, tipado y CI coherentes`);
