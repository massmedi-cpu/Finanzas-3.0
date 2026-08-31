export type ThemePreference="system"|"light"|"dark";
export type EffectiveTheme="light"|"dark";

export const THEME_STORAGE_KEY="financial-app-theme";
export const THEME_CHANGE_EVENT="financial-app-theme-change";
export const THEME_CHROME={light:"#f4f7fb",dark:"#070d18"} as const;

export function normalizeThemePreference(value:unknown):ThemePreference{
  return value==="light"||value==="dark"||value==="system"?value:"system";
}
export function readStoredThemePreference():ThemePreference{
  if(typeof window==="undefined")return "system";
  try{return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));}catch(error){void error;return "system";}
}
export function resolveThemePreference(preference:ThemePreference):EffectiveTheme{
  if(preference!=="system")return preference;
  if(typeof window==="undefined")return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
}
export function applyThemePreference(preference:ThemePreference){
  if(typeof document==="undefined")return;
  const effective=resolveThemePreference(preference);
  const root=document.documentElement;
  root.dataset.theme=effective;
  root.dataset.themePreference=preference;
  root.style.colorScheme=effective;
  let meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if(!meta){meta=document.createElement("meta");meta.name="theme-color";document.head.appendChild(meta);}
  meta.content=THEME_CHROME[effective];
}
export function persistThemePreference(preference:ThemePreference){
  if(typeof window==="undefined")return;
  try{window.localStorage.setItem(THEME_STORAGE_KEY,preference);}catch(error){void error;}
  applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent<{theme:ThemePreference}>(THEME_CHANGE_EVENT,{detail:{theme:preference}}));
}