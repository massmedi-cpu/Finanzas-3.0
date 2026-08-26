import type { MetadataRoute } from "next";
import { APP_VERSION } from "@/lib/app-version";

export default function manifest():MetadataRoute.Manifest{
  return {
    name:"Financial App",
    short_name:"Financial App",
    description:`Control y planificación financiera personal · versión ${APP_VERSION}`,
    start_url:"/",
    display:"standalone",
    background_color:"#f4f2ed",
    theme_color:"#f4f2ed",
    lang:"es-ES",
    icons:[
      {src:"/icon.png",sizes:"512x512",type:"image/png"},
      {src:"/apple-icon.png",sizes:"180x180",type:"image/png"}
    ]
  };
}
