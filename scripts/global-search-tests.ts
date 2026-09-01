import assert from "node:assert/strict";
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

console.log(`Global search tests OK · ${appDestinations.length} destinos, búsqueda tolerante y navegación interna protegidos`);
