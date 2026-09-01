import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appDestinations,filterAppDestinations,movementSearchHref,normalizeDestinationSearch } from "../lib/ui/app-destinations";

assert.equal(new Set(appDestinations.map(item=>item.href)).size,appDestinations.length,"Cada destino debe tener una URL única");
assert.ok(appDestinations.every(item=>item.href.startsWith("/")&&!item.href.startsWith("//")),"Todos los destinos deben ser rutas internas seguras");
assert.equal(normalizeDestinationSearch("  PREVISIÓN  "),"prevision");
assert.equal(filterAppDestinations("ticket")[0]?.label,"Archivo");
assert.equal(filterAppDestinations("proximos cargos")[0]?.label,"Previsión");
assert.equal(filterAppDestinations("valor neto")[0]?.label,"Patrimonio");
assert.equal(filterAppDestinations("drive actualizar")[0]?.label,"Importación");
assert.equal(filterAppDestinations("mov")[0]?.label,"Movimientos");
assert.ok(filterAppDestinations("").some(item=>item.href==="/movimientos"));
assert.equal(movementSearchHref("  Mercadona Sevilla  "),"/movimientos?search=Mercadona%20Sevilla");
assert.equal(movementSearchHref("javascript:alert(1)"),"/movimientos?search=javascript%3Aalert(1)");
assert.equal(movementSearchHref("   "),"/movimientos");

const chrome=readFileSync("components/app-chrome.tsx","utf8");
assert.ok(chrome.includes('import dynamic from "next/dynamic"'),"El shell debe soportar code-splitting de superficies privadas");
assert.ok(!chrome.includes('import { AppNavigation } from "@/components/app-navigation"'),"La navegación privada no debe volver al bundle estático del shell público");
assert.ok(!chrome.includes('import { GlobalSearch } from "@/components/global-search"'),"La búsqueda completa no debe volver al bundle estático del shell");
assert.ok(chrome.includes('dynamic(()=>import("@/components/app-navigation").then(module=>module.AppNavigation))'),"La navegación privada debe cargarse como chunk separado");
assert.ok(chrome.includes('dynamic(()=>import("@/components/global-search").then(module=>module.GlobalSearch),{ssr:false})'),"La búsqueda global debe cargarse solo en cliente bajo demanda");
assert.ok(chrome.includes('{searchOpen&&<GlobalSearch open'),"El chunk de búsqueda no debe montarse mientras el diálogo está cerrado");
assert.ok(chrome.includes('(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"'),"Ctrl/Cmd+K debe permanecer en el shell ligero para poder abrir el chunk bajo demanda");
assert.ok(chrome.indexOf("if(publicRoute)return")<chrome.indexOf("<AppNavigation"),"Las rutas públicas deben resolverse antes de montar navegación privada");

console.log(`Global search tests OK · ${appDestinations.length} destinos, búsqueda tolerante, navegación interna y shell privado bajo demanda protegidos`);
