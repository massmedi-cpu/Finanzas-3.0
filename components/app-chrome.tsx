"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

export function AppChrome({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const publicRoute=pathname==="/login"||pathname.startsWith("/auth/");
  if(publicRoute)return <>{children}</>;
  return <div className="app-root private"><AppSidebar/><div className="app-route">{children}</div></div>;
}
