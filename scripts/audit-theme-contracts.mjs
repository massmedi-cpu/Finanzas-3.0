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

for(const token of ["html[data-theme=\"light\"]","html[data-theme=\"dark\"]","color-scheme:light","color-scheme:dark","--expense:","--success:"]){
  if(!globals.includes(token))failures.push(`Falta contrato visual de tema: ${token}`);
}
for(const token of ["dataset.theme=e","dataset.themePreference=p","prefers-color-scheme: dark","meta[name=\"theme-color\"]","#111412","#f4f2ed"]){
  if(!layout.includes(token))failures.push(`Bootstrap de tema incompleto: ${token}`);
}
if(!manifest.includes('background_color:"#f4f2ed"')||!manifest.includes('theme_color:"#f4f2ed"'))failures.push("El manifiesto PWA no usa la superficie canónica clara");
if(!chrome.includes("<ThemeController/>"))failures.push("El shell privado no monta el controlador canónico de tema");
for(const token of ["matchMedia(\"(prefers-color-scheme: dark)\")","addEventListener(\"change\"","addEventListener(\"storage\"","MutationObserver","fetch(\"/api/settings\"","persistThemePreference(serverTheme)"]){
  if(!controller.includes(token))failures.push(`ThemeController incompleto: ${token}`);
}
for(const token of ["THEME_STORAGE_KEY","THEME_CHROME","root.dataset.theme=effective","root.dataset.themePreference=preference","root.style.colorScheme=effective","meta.content=THEME_CHROME[effective]"]){
  if(!theme.includes(token))failures.push(`Runtime canónico de tema incompleto: ${token}`);
}
if(!theme.includes('light:"#f4f2ed"')||!theme.includes('dark:"#111412"'))failures.push("El runtime de tema no comparte los colores de chrome con el layout");
if(!controls.includes("color:var(--expense)")||!controls.includes("color:var(--success)"))failures.push("Los controles semánticos deben consumir tokens de tema, no colores duplicados por modo");
if(!settings.includes('localStorage.setItem("financial-app-theme", theme)'))failures.push("Configuración debe persistir la preferencia de tema");

if(failures.length){console.error("Theme contract audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Theme contract audit OK · tema efectivo, sistema, PWA chrome, tokens semánticos y sincronización servidor/dispositivo protegidos");
