import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";
import "./home.css";
import "./home-v17.css";
import "./system-state.css";
import "./chrome.css";
import "./readability-v210.css";
export const metadata:Metadata={title:{default:"Financial App",template:"%s · Financial App"},applicationName:"Financial App",description:"Control, análisis, presupuesto y planificación financiera personal",manifest:"/manifest.webmanifest",icons:{icon:[{url:"/icon.png",type:"image/png",sizes:"512x512"}],apple:[{url:"/apple-icon.png",type:"image/png",sizes:"180x180"}]},appleWebApp:{capable:true,title:"Financial App",statusBarStyle:"default"}};export const viewport:Viewport={themeColor:"#0b72ff",colorScheme:"light dark"};const themeBootstrap=`try{const t=localStorage.getItem('financial-app-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es-ES" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body><AppChrome>{children}</AppChrome></body></html>}
