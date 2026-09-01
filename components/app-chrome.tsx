"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback,useEffect,useState } from "react";
import { NetworkStatusBanner,useNetworkStatus } from "@/components/network-status";
import { ThemeController } from "@/components/theme-controller";

const AppNavigation=dynamic(()=>import("@/components/app-navigation").then(module=>module.AppNavigation));
const GlobalSearch=dynamic(()=>import("@/components/global-search").then(module=>module.GlobalSearch),{ssr:false});

export function AppChrome({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const [searchOpen,setSearchOpen]=useState(false);
  const openSearch=useCallback(()=>setSearchOpen(true),[]);
  const closeSearch=useCallback(()=>setSearchOpen(false),[]);
  const network=useNetworkStatus();
  const publicRoute=pathname==="/login"||pathname.startsWith("/auth/");
  const status=network.state==="offline"?"Sin conexión · datos sin actualizar":network.state==="checking"?"Comprobando conexión…":network.state==="restored"?"Conexión restablecida":"Datos reales · fuente solo lectura";

  useEffect(()=>{
    if(publicRoute)return;
    const handleShortcut=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        setSearchOpen(value=>!value);
      }
    };
    window.addEventListener("keydown",handleShortcut);
    return()=>window.removeEventListener("keydown",handleShortcut);
  },[publicRoute]);

  if(publicRoute)return <><ThemeController/><NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>{children}</>;
  return <div className="app-root private">
    <ThemeController/>
    <AppNavigation status={status} statusTone={network.state} onOpenSearch={openSearch}/>
    {searchOpen&&<GlobalSearch open onOpen={openSearch} onClose={closeSearch}/>} 
    <NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>
    <div className="app-route">{children}</div>
  </div>;
}
