import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkStatusBanner,resolveNetworkState } from "../components/network-status";

assert.equal(resolveNetworkState(null,true),"online");
assert.equal(resolveNetworkState(null,false),"offline");
assert.equal(resolveNetworkState("online",false),"offline");
assert.equal(resolveNetworkState("offline",true),"restored");
assert.equal(resolveNetworkState("online",true),"online");

const render=(state:Parameters<typeof NetworkStatusBanner>[0]["state"],checking=false)=>renderToStaticMarkup(createElement(NetworkStatusBanner,{state,checking,onRetry:()=>undefined}));

const online=render("online");
assert.equal(online,"");

const offline=render("offline");
assert.match(offline,/role="alert"/);
assert.match(offline,/aria-live="assertive"/);
assert.match(offline,/Sin conexión/);
assert.match(offline,/no actualizar ni guardar datos/);
assert.match(offline,/>Reintentar</);
assert.doesNotMatch(offline,/disabled=""/);

const retrying=render("offline",true);
assert.match(retrying,/disabled=""/);
assert.match(retrying,/>Comprobando…</);

const restored=render("restored");
assert.match(restored,/role="status"/);
assert.match(restored,/aria-live="polite"/);
assert.match(restored,/Conexión restablecida/);
assert.doesNotMatch(restored,/<button/);

console.log("Network status tests OK · pérdida, reintento, recuperación y semántica accesible protegidos");
