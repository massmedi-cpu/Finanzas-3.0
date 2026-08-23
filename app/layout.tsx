import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";
import "./home.css";
import "./home-v17.css";
import "./cash-flow.css";
import "./cash-flow-advanced.css";
import "./system-state.css";
import "./chrome.css";
import "./readability-v210.css";
import "./explicabilidad/explainability.css";
import "./control/integrity.css";

export const metadata:Metadata={title:{default:"Financial App",template:"%s · Financial App"},applicationName:"Financial App",description:"Control, análisis, presupuesto y planificación financiera personal",manifest:"/manifest.webmanifest",icons:{icon:[{url:"/icon.png",type:"image/png",sizes:"512x512"}],apple:[{url:"/apple-icon.png",type:"image/png",sizes:"180x180"}]},appleWebApp:{capable:true,title:"Financial App",statusBarStyle:"default"}};
export const viewport:Viewport={themeColor:"#0b72ff",colorScheme:"light dark"};
const themeBootstrap=`try{const t=localStorage.getItem('financial-app-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(error){void error}`;

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="es-ES" suppressHydrationWarning><head><script>{themeBootstrap}</script></head><body><AppChrome>{children}</AppChrome></body></html>;
}
