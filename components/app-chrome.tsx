"use client";

import { usePathname } from "next/navigation";
import { useCallback,useState } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { GlobalSearch } from "@/components/global-search";
import { NetworkStatusBanner,useNetworkStatus } from "@/components/network-status";
import { ThemeController } from "@/components/theme-controller";

export function AppChrome({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const [searchOpen,setSearchOpen]=useState(false);
  const openSearch=useCallback(()=>setSearchOpen(true),[]);
  const closeSearch=useCallback(()=>setSearchOpen(false),[]);
  const network=useNetworkStatus();
  const publicRoute=pathname==="/login"||pathname.startsWith("/auth/");
  const status=network.state==="offline"?"Sin conexión · datos sin actualizar":network.state==="checking"?"Comprobando conexión…":network.state==="restored"?"Conexión restablecida":"Datos reales · fuente solo lectura";
  if(publicRoute)return <><ThemeController/><NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>{children}</>;
  return <div className="app-root private">
    <ThemeController/>
    <AppNavigation status={status} statusTone={network.state} onOpenSearch={openSearch}/>
    <GlobalSearch open={searchOpen} onOpen={openSearch} onClose={closeSearch}/>
    <NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>
    <div className="app-route">{children}</div>
  </div>;
}
