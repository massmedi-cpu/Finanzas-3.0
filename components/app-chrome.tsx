"use client";

import { usePathname } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { NetworkStatusBanner,useNetworkStatus } from "@/components/network-status";
import { ThemeController } from "@/components/theme-controller";

export function AppChrome({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const network=useNetworkStatus();
  const publicRoute=pathname==="/login"||pathname.startsWith("/auth/");
  const status=network.state==="offline"?"Sin conexión · datos sin actualizar":network.state==="checking"?"Comprobando conexión…":network.state==="restored"?"Conexión restablecida":"Datos reales · fuente solo lectura";
  if(publicRoute)return <><ThemeController/><NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>{children}</>;
  return <div className="app-root private">
    <ThemeController/>
    <AppNavigation status={status} statusTone={network.state}/>
    <NetworkStatusBanner state={network.state} checking={network.checking} onRetry={()=>void network.retry()}/>
    <div className="app-route">{children}</div>
  </div>;
}
