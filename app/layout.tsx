import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";
import "./controls.css";
import "./home.css";
import "./system-state.css";
import "./chrome.css";
import "./visual.css";
import "./document-linking.css";
import "./tablet.css";

export const metadata:Metadata={title:{default:"Financial App",template:"%s · Financial App"},applicationName:"Financial App",description:"Control, análisis, presupuesto y planificación financiera personal",manifest:"/manifest.webmanifest",icons:{icon:[{url:"/icon.png",type:"image/png",sizes:"512x512"}],apple:[{url:"/apple-icon.png",type:"image/png",sizes:"180x180"}]},appleWebApp:{capable:true,title:"Financial App",statusBarStyle:"default"}};
export const viewport:Viewport={themeColor:"#f4f6f8",colorScheme:"light dark"};
const themeBootstrap=`try{const raw=localStorage.getItem('financial-app-theme');const p=raw==='light'||raw==='dark'||raw==='system'?raw:'system';const e=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;const r=document.documentElement;r.dataset.theme=e;r.dataset.themePreference=p;r.style.colorScheme=e;let m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.content=e==='dark'?'#0d1117':'#f4f6f8'}catch(error){void error}`;

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="es-ES" suppressHydrationWarning><head><script>{themeBootstrap}</script></head><body><AppChrome>{children}</AppChrome></body></html>;
}
