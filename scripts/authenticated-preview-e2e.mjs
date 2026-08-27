const baseRaw=String(process.env.FINANCIAL_APP_PREVIEW_URL||"").trim();
const token=String(process.env.FINANCIAL_APP_PREVIEW_TOKEN||"").trim();
const bypass=String(process.env.FINANCIAL_APP_VERCEL_PROTECTION_BYPASS||"").trim();

if(!baseRaw)throw new Error("FINANCIAL_APP_PREVIEW_URL is required");
if(token.length<32||token.length>160)throw new Error("FINANCIAL_APP_PREVIEW_TOKEN must contain a valid one-time token");
const base=new URL(baseRaw);
if(base.protocol!=="https:")throw new Error("Preview URL must use HTTPS");

const probeUrl=new URL("/auth/preview",base);
probeUrl.searchParams.set("token",token);
probeUrl.searchParams.set("next","/api/release-probe");

const headers={accept:"application/json","user-agent":"Financial-App-authenticated-preview-e2e/4.3"};
if(bypass)headers["x-vercel-protection-bypass"]=bypass;

async function request(){return fetch(probeUrl,{method:"GET",headers,redirect:"manual",cache:"no-store"});}

const first=await request();
if(first.status!==200){const location=first.headers.get("location")||"";throw new Error(`Authenticated preview probe failed with HTTP ${first.status}${location?` -> ${new URL(location,base).pathname}`:""}`);}
const payload=await first.json();
const expectedTop=["checks","ok","privateSession","version"];
const actualTop=Object.keys(payload).sort();
if(JSON.stringify(actualTop)!==JSON.stringify(expectedTop))throw new Error("Probe returned unexpected top-level fields");
if(payload.ok!==true||payload.privateSession!==true||payload.version!=="4.3.0")throw new Error("Probe identity/version contract failed");
const expectedChecks=["archiveReadable","dashboardReadable","forecastContracts","forecastReadable","matchingObservabilityReadable","matchingQualityGate","movementsReadable"];
const actualChecks=Object.keys(payload.checks||{}).sort();
if(JSON.stringify(actualChecks)!==JSON.stringify(expectedChecks))throw new Error("Probe returned unexpected check fields");
for(const key of expectedChecks)if(payload.checks[key]!==true)throw new Error(`Authenticated read failed: ${key}`);

const replay=await request();
if(replay.status!==307&&replay.status!==308)throw new Error(`One-time token replay was not rejected: HTTP ${replay.status}`);
const replayLocation=replay.headers.get("location");
if(!replayLocation)throw new Error("Rejected replay did not return a login redirect");
const rejected=new URL(replayLocation,base);
if(rejected.pathname!=="/login"||rejected.searchParams.get("error")!=="preview")throw new Error("Rejected replay did not use the safe preview login error path");

console.log("Authenticated preview E2E OK · private dashboard, movements, forecast, archive and matching-quality gate verified · token replay rejected");
