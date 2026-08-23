import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const exists=(path)=>fs.existsSync(path);
const layout=read("app/layout.tsx");
const visual=read("app/visual.css");
const controls=read("app/controls.css");
const globals=read("app/globals.css");
const tablet=read("app/tablet.css");
const chromeCss=read("app/chrome.css");
const loading=read("app/loading.tsx");
const chrome=read("components/app-chrome.tsx");
const sidebar=read("components/app-sidebar.tsx");
const intentLink=read("components/intent-link.tsx");
const cashFlow=read("components/cash-flow-chart.tsx");
const analysis=read("components/analysis-trend-chart.tsx");
const balance=read("components/balance-chart.tsx");
const netWorth=read("components/net-worth-chart.tsx");
const archive=read("app/archivo/archive-client.tsx");
const archiveLib=read("lib/financial/archive.ts");
const archiveCss=read("app/archive.css");
const forecast=read("app/prevision/forecast-client.tsx");
const forecastPage=read("app/prevision/page.tsx");
const forecastCss=read("app/forecast.css");
const movements=read("app/movimientos/movements-client.tsx");
const movementsCss=read("app/movements.css");
const vercel=read("vercel.json");

const checks=[
  [layout.includes('import "./controls.css"'),"los controles compartidos deben cargarse globalmente"],
  [layout.includes('import "./visual.css"'),"la base visual consolidada debe cargarse desde el layout raíz"],
  [layout.lastIndexOf('visual.css')>layout.lastIndexOf('integrity.css'),"visual.css debe cargarse después de las hojas estructurales"],
  [layout.includes('import "./tablet.css"')&&layout.lastIndexOf('tablet.css')>layout.lastIndexOf('visual.css'),"la adaptación tablet debe cargarse después de la base visual"],
  [!layout.includes("home-v17.css")&&!layout.includes("readability-v210.css")&&!layout.includes("visual-v300.css"),"el runtime no debe volver a cargar capas CSS históricas versionadas"],
  [!exists("app/home-v17.css")&&!exists("app/readability-v210.css")&&!exists("app/visual-v300.css"),"las capas históricas ya consolidadas no deben reaparecer"],
  [!globals.includes("grid-template-columns:82px")&&!globals.includes(".ghost{margin-top:18px}"),"globals.css no debe competir con la navegación responsive ni alterar todos los botones móviles"],
  [controls.includes(".primary-action{")&&controls.includes("background:var(--accent)")&&controls.includes('[aria-busy="true"]::before'),"las acciones principales deben tener estilo y feedback de carga comunes"],
  [controls.includes(".inline-alert{")&&controls.includes(".empty-state{"),"alertas y estados vacíos compartidos deben vivir en la capa común"],
  [visual.includes("--chart-income")&&visual.includes("--chart-expense")&&visual.includes("--chart-accent")&&visual.includes("--chart-grid"),"debe existir una semántica común de colores para gráficos"],
  [visual.includes('html[data-theme="light"]')&&visual.includes('html[data-theme="dark"]'),"la paleta común debe soportar tema claro y oscuro explícitos"],
  [visual.includes(".home-kpis{grid-template-columns:repeat(12")&&visual.includes(".home-kpis a{grid-column:span 4"),"Inicio debe usar una jerarquía ejecutiva 3+3 sin huecos"],
  [visual.includes(".cf-income{fill:var(--chart-income)!important}")&&visual.includes(".cf-expense{fill:var(--chart-expense)!important}"),"Cash Flow debe reutilizar la paleta común"],
  [visual.includes(".cf-acc-line{stroke:var(--chart-accent)!important;fill:none!important}"),"el acumulado de Cash Flow debe seguir siendo una línea sin relleno"],
  [visual.includes(".a-bar-current")&&visual.includes(".a-line-current")&&analysis.includes("analysis-chart"),"Análisis debe quedar cubierto por la base común de gráficos"],
  [visual.includes(".balance-chart-line")&&visual.includes(".balance-chart-area")&&balance.includes("balance-chart-area"),"el histórico de saldo debe quedar cubierto por la base común"],
  [visual.includes(".nw-line")&&visual.includes(".nw-grid-line")&&netWorth.includes("nw-chart"),"Patrimonio debe quedar cubierto por la base común"],
  [cashFlow.includes("Ingresos / gastos")&&cashFlow.includes("const accY="),"la corrección de doble eje 2.8.1 debe permanecer intacta"],
  [loading.includes('className="route-loading-v300"')&&!loading.includes("system-state-shell")&&!loading.includes("next/image"),"la navegación privada debe usar carga local sin sustituir el shell"],
  [visual.includes("prefers-reduced-motion:reduce")&&visual.includes("v300-shimmer"),"el skeleton debe respetar movimiento reducido"],
  [chrome.includes('<AppSidebar/><div className="app-route">{children}</div>'),"el shell persistente debe conservar sidebar y ruta separada"],
  [chromeCss.includes("html{scrollbar-gutter:stable}"),"la navegación debe reservar el gutter del scrollbar"],
  [chromeCss.includes("@media(min-width:1181px)")&&chromeCss.includes("height:100dvh;max-height:100dvh;overflow:hidden")&&chromeCss.includes("nav.desktop-nav{flex:1 1 auto;min-height:0;overflow-y:auto"),"en escritorio el menú lateral debe caber en el viewport y tener scroll vertical propio"],
  [chromeCss.includes("overscroll-behavior-y:contain")&&chromeCss.includes("scrollbar-width:thin")&&chromeCss.includes("::-webkit-scrollbar-thumb"),"el scroll del menú lateral debe ser visible y no arrastrar la página"],
  [sidebar.includes("desktopNavRef")&&sidebar.includes("scrollIntoView({block:\"nearest\",inline:\"nearest\"})"),"la opción activa debe mantenerse visible al navegar por un menú con scroll"],
  [sidebar.includes('onClick={()=>setMoreOpen(false)}>{label}</IntentLink>'),"los enlaces deben cerrar el menú móvil antes de iniciar transición"],
  [chromeCss.includes('.app-root.private>.sidebar nav.mobile-nav{display:none!important}'),"el menú móvil debe permanecer oculto fuera del breakpoint móvil"],
  [chromeCss.includes('@media(max-width:1180px) and (min-width:681px)')&&chromeCss.includes('nav.desktop-nav{display:flex!important;flex:1 1 auto')&&chromeCss.includes('overflow-x:auto'),"tablet debe usar navegación horizontal completa sin hamburguesa"],
  [!chromeCss.includes('grid-template-columns:82px minmax(0,1fr)'),"tablet no debe volver al rail comprimido de 82px"],
  [chromeCss.includes('@media(max-width:680px)')&&chromeCss.includes('.app-root.private>.sidebar nav.mobile-nav{display:flex!important;height:100%'),"el menú Más sólo debe activarse en móvil"],
  [intentLink.includes('data-nav-pending={pending?"true":undefined}')&&intentLink.includes('aria-busy={pending||undefined}'),"los enlaces deben dar respuesta visual inmediata"],
  [!intentLink.includes('onTouchStart={event=>{warm();'),"un toque no debe lanzar un prefetch duplicado"],
  [tablet.includes('@media (min-width:681px) and (max-width:1180px)')&&tablet.includes('.detail-loading{position:static!important'),"tablet debe eliminar el indicador flotante de Movimientos"],
  [tablet.includes('.workspace{max-width:none!important;width:100%')&&tablet.includes('.movement-drawer{width:100%;max-width:none'),"tablet debe aprovechar el ancho disponible"],
  [archive.includes("Hacer foto de ticket")&&archive.includes('capture="environment"'),"Archivo debe permitir foto con cámara trasera"],
  [archive.includes("Elegir foto de galería")&&archive.includes("galleryRef"),"Archivo debe permitir elegir una foto existente"],
  [archive.includes("Añadir documento")&&archive.includes('accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"'),"Archivo debe mantener importación PDF e imágenes"],
  [archive.includes('type ActionKind=')&&!archive.includes("const [busy,setBusy]"),"Archivo no debe volver a un estado busy global que bloquee todos los botones"],
  [archive.includes('data-loading={isAction("save")?"true":undefined}')&&archive.includes('"Guardando…":"Guardar cambios"'),"Guardar cambios debe tener feedback específico"],
  [archiveLib.includes("p_include_archived:true")&&!archive.includes("archive-view-switch")&&!archive.includes("Mover a Archivados")&&!archive.includes("Restaurar a Activos"),"Archivo debe ser una biblioteca única sin estados Activos/Archivados"],
  [archive.includes("Biblioteca única")&&archive.includes("Eliminar documento"),"Archivo debe explicar la biblioteca única y permitir eliminación directa"],
  [archive.includes("receipt-table")&&archive.includes("<th>Descripción</th><th>Ud.</th><th>Precio</th><th>Total</th>"),"la reconstrucción del ticket debe usar columnas reales"],
  [archiveCss.includes(".receipt-table{")&&archiveCss.includes(".receipt-table-wrap{"),"las columnas del ticket deben ser responsive"],
  [archiveCss.includes(".archive-module .drawer-backdrop{position:fixed;z-index:80;inset:0")&&archiveCss.includes("justify-content:flex-end"),"Archivo debe abrir el detalle como overlay fijo"],
  [archiveCss.includes("@media(max-width:1050px) and (min-width:681px)")&&archiveCss.includes(".archive-drawer{flex:1 1 auto;width:100%;max-width:none"),"en tablet el panel de Archivo debe ocupar todo el ancho"],
  [archiveCss.includes("height:100dvh")&&archiveCss.includes("min-width:0"),"el panel de Archivo debe respetar el viewport"],
  [forecastPage.includes("getForecastOverview(365)")&&forecastPage.includes("Solo lo confirmado entra en el cálculo"),"Previsión debe cargar un año y explicar qué entra en el cálculo"],
  [forecast.includes("Mes que quieres revisar")&&forecast.includes("Gastos que quedan")&&forecast.includes("Ingresos que quedan"),"Previsión debe responder por mes qué pagos y cobros quedan"],
  [forecast.includes("Confirmado = cuenta")&&forecast.includes("Sugerido = no cuenta")&&!forecast.includes("const horizons="),"la filosofía de previsión debe ser explícita y no volver al selector por días"],
  [forecast.includes("monthEvents")&&forecast.includes("selectedMonth")&&forecast.includes("monthOptions"),"la vista principal debe filtrar los vencimientos por el mes seleccionado"],
  [forecastCss.includes(".forecast-month-selector{")&&forecastCss.includes(".forecast-month-summary{")&&forecastCss.includes(".forecast-philosophy{"),"la previsión mensual debe tener jerarquía visual propia"],
  [movementsCss.includes('.detail-loading{position:fixed')&&tablet.includes('.detail-loading{position:static!important'),"el estado de carga heredado puede ser fijo en escritorio pero debe neutralizarse en tablet"],
  [movements.includes("Automático según reglas")&&!movements.includes(">Regla automática</option>"),"Cash Flow debe usar lenguaje comprensible"],
  [movements.includes("Automático / según origen")&&!movements.includes(">Sin override</option>"),"Conciliación debe evitar terminología técnica"],
  [movements.includes("No indicado")&&movements.includes("Sí, se repite")&&movements.includes("No, es puntual"),"Recurrente debe expresarse en lenguaje claro"],
  [vercel.includes('"develop/v3.0.0-foundation": false'),"la rama 3.0 debe permanecer sin Preview de Vercel"],
  [vercel.includes('"hotfix/v3.0.1-document-ux": false'),"el hotfix documental debe permanecer sin Preview de Vercel"],
  [vercel.includes('"hotfix/v3.0.3-tablet-archive": false'),"el hotfix tablet debe permanecer sin Preview de Vercel"],
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){console.error("Audit 3.0 FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Audit 3.0 OK · visual consolidada, navegación adaptable, biblioteca única, ticket tabulado y previsión mensual protegidos");
