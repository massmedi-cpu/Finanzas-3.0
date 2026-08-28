import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const failures=[];
const layout=read("app/layout.tsx");
const manifest=read("app/manifest.ts");
const globals=read("app/globals.css");
const controls=read("app/controls.css");
const chrome=read("components/app-chrome.tsx");
const controller=read("components/theme-controller.tsx");
const theme=read("lib/ui/theme.ts");
const settings=read("app/configuracion/settings-client.tsx");

for(const token of [
  "html[data-theme=\"light\"]","html[data-theme=\"dark\"]","color-scheme:light","color-scheme:dark",
  "--background-primary:","--surface-primary:","--text-primary:","--gold-primary:","--positive:","--negative:","--warning:","--info:","--focus:"
]){if(!globals.includes(token))failures.push(`Falta contrato visual de tema: ${token}`);}
for(const forbidden of ["#0b4f8a","#4c9bff"]){if(globals.includes(forbidden))failures.push(`Permanece identidad azul heredada en la paleta global: ${forbidden}`);}
for(const token of ["dataset.theme=e","dataset.themePreference=p","prefers-color-scheme: dark","meta[name=\"theme-color\"]","THEME_CHROME.dark","THEME_CHROME.light"]){if(!layout.includes(token))failures.push(`Bootstrap de tema incompleto: ${token}`);}
if(!layout.includes('import { THEME_CHROME } from "@/lib/ui/theme"'))failures.push("layout.tsx debe consumir el color de chrome desde la fuente canónica");
if(!manifest.includes("background_color:THEME_CHROME.light")||!manifest.includes("theme_color:THEME_CHROME.light"))failures.push("El manifiesto PWA debe consumir la superficie canónica desde THEME_CHROME");
if(!chrome.includes("<ThemeController/>"))failures.push("El shell no monta el controlador canónico de tema");
if(!chrome.includes('if(publicRoute)return <><ThemeController/>{children}</>;'))failures.push("Login/auth deben mantener activo ThemeController para no perder la preferencia al entrar o salir");
for(const token of ["matchMedia(\"(prefers-color-scheme: dark)\")","addEventListener(\"change\"","addEventListener(\"storage\"","MutationObserver","fetch(\"/api/settings\"","persistThemePreference(serverTheme)","hasStoredThemePreference","hasStoredPreference","if(hasStoredPreference)return;"]){if(!controller.includes(token))failures.push(`ThemeController incompleto: ${token}`);}
if(controller.indexOf("if(hasStoredPreference)return;")>controller.indexOf("persistThemePreference(serverTheme)"))failures.push("La preferencia del servidor puede volver a pisar una preferencia local explícita");
for(const token of ["THEME_STORAGE_KEY","THEME_CHROME","root.dataset.theme=effective","root.dataset.themePreference=preference","root.style.colorScheme=effective","meta.content=THEME_CHROME[effective]",'light:"#f4f1e9"','dark:"#0b0c0e"']){if(!theme.includes(token))failures.push(`Runtime canónico de tema incompleto: ${token}`);}
for(const token of ["background:var(--accent)","color:var(--negative)","color:var(--positive)"]){if(!controls.includes(token))failures.push(`Los controles semánticos deben consumir tokens centrales: ${token}`);}
if(!settings.includes('localStorage.setItem("financial-app-theme", theme)'))failures.push("Configuración debe persistir la preferencia de tema");

if(failures.length){console.error("Theme contract audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Theme contract audit OK · sistema claro/oscuro, negro/carbón/dorado y colores financieros semánticos protegidos");
