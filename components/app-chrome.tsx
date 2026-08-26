"use client";

import { usePathname } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { ThemeController } from "@/components/theme-controller";

export function AppChrome({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const publicRoute=pathname==="/login"||pathname.startsWith("/auth/");
  if(publicRoute)return <><ThemeController/>{children}</>;
  return <div className="app-root private">
    <ThemeController/>
    <AppNavigation/>
    <div className="app-route">{children}</div>
  </div>;
}
