"use client";

import { useEffect } from "react";
import {
  applyThemePreference,
  normalizeThemePreference,
  persistThemePreference,
  readStoredThemePreference,
  resolveThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/ui/theme";

export function ThemeController(){
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const root=document.documentElement;
    let preference=readStoredThemePreference();
    applyThemePreference(preference);

    const onSystemChange=()=>{
      preference=readStoredThemePreference();
      if(preference==="system")applyThemePreference("system");
    };
    const onStorage=(event:StorageEvent)=>{
      if(event.key!==THEME_STORAGE_KEY)return;
      preference=normalizeThemePreference(event.newValue);
      applyThemePreference(preference);
    };
    const onThemeChange=(event:Event)=>{
      const custom=event as CustomEvent<{theme?:ThemePreference}>;
      preference=normalizeThemePreference(custom.detail?.theme);
      applyThemePreference(preference);
    };
    const observer=new MutationObserver(()=>{
      const selected=root.dataset.theme;
      if(!selected){preference="system";applyThemePreference("system");return;}
      if(selected!=="light"&&selected!=="dark")return;
      const stored=readStoredThemePreference();
      if(stored==="system"&&selected===resolveThemePreference("system"))return;
      if(root.dataset.themePreference===selected)return;
      preference=selected;
      applyThemePreference(selected);
    });

    media.addEventListener("change",onSystemChange);
    window.addEventListener("storage",onStorage);
    window.addEventListener(THEME_CHANGE_EVENT,onThemeChange);
    observer.observe(root,{attributes:true,attributeFilter:["data-theme"]});

    void fetch("/api/settings",{cache:"no-store"})
      .then(async response=>response.ok?response.json():null)
      .then(body=>{
        const serverTheme=body?.data?.preferences?.theme;
        if(serverTheme!=="system"&&serverTheme!=="light"&&serverTheme!=="dark")return;
        preference=serverTheme;
        persistThemePreference(serverTheme);
      })
      .catch(()=>undefined);

    return()=>{
      observer.disconnect();
      media.removeEventListener("change",onSystemChange);
      window.removeEventListener("storage",onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT,onThemeChange);
    };
  },[]);
  return null;
}
