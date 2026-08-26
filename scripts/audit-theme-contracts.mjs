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

for(const token of ["html[data-theme=\"light\"]","html[data-theme=\"dark\"]","color-scheme:light","color-scheme:dark"]){
  if(!globals.includes(token))failures.push(`Falta contrato visual de tema: ${token}`);
}
for(const token of ["dataset.theme=e","dataset.themePreference=p","prefers-color-scheme: dark","meta[name=\"theme-color\"]","#0d1117","#f4f6f8"]){
  if(!layout.includes(token))failures.push(`Bootstrap de tema incompleto: ${token}`);
}
if(layout.includes('themeColor:"#0b72ff"')||manifest.includes('theme_color:"#0b72ff"'))failures.push("El chrome PWA no puede quedarse fijado al azul de marca");
if(!chrome.includes("<ThemeController/>"))failures.push("El shell privado no monta el controlador canónico de tema");
for(const token of ["matchMedia(\"(prefers-color-scheme: dark)\")","addEventListener(\"change\"","addEventListener(\"storage\"","MutationObserver","fetch(\"/api/settings\"","persistThemePreference(serverTheme)"]){
  if(!controller.includes(token))failures.push(`ThemeController incompleto: ${token}`);
}
for(const token of ["THEME_STORAGE_KEY","root.dataset.theme=effective","root.dataset.themePreference=preference","root.style.colorScheme=effective","meta.content=effective===\"dark\""]){
  if(!theme.includes(token))failures.push(`Runtime canónico de tema incompleto: ${token}`);
}
if(!controls.includes('html[data-theme="dark"] .inline-alert.error')||!controls.includes('html[data-theme="dark"] .danger-action'))failures.push("Los controles con color semántico no obedecen el modo oscuro explícito");
if(!settings.includes('localStorage.setItem("financial-app-theme", theme)'))failures.push("Configuración debe persistir la preferencia de tema");

if(failures.length){console.error("Theme contract audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Theme contract audit OK · tema efectivo, sistema, PWA chrome, controles y sincronización servidor/dispositivo protegidos");
