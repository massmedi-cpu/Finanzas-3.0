import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const exists=path=>fs.existsSync(path);
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const layout=read("app/layout.tsx");
const globals=read("app/globals.css");
const visual=read("app/visual.css");
const controls=read("app/controls.css");
const chromeCss=read("app/chrome.css");
const tablet=read("app/tablet.css");
const home=read("app/page.tsx");
const homeCss=read("app/home.css");
const chrome=read("components/app-chrome.tsx");
const navigation=read("components/app-navigation.tsx");
const intentLink=read("components/intent-link.tsx");
const loading=read("app/loading.tsx");
const cashFlow=read("components/cash-flow-chart.tsx");
const analysis=read("components/analysis-trend-chart.tsx");
const balance=read("components/balance-chart.tsx");
const netWorth=read("components/net-worth-chart.tsx");
const movements=read("app/movimientos/movements-client.tsx");
const movementsCss=read("app/movements.css");
const archive=read("app/archivo/archive-client.tsx");
const archiveLib=read("lib/financial/archive.ts");
const archiveCss=read("app/archive.css");
const receiptLayout=read("lib/document/receipt-layout.ts");
const forecast=read("app/prevision/forecast-client.tsx");
const forecastPage=read("app/prevision/page.tsx");
const forecastCss=read("app/forecast.css");
const forecastMigration=read("database/FINANCIAL_APP_3.4.8_FORECAST_PROBABILISTIC_MODEL.sql");
const manifest=read("app/manifest.ts");

// Carga y arquitectura CSS.
must(layout.includes('import "./controls.css"'),"los controles compartidos deben cargarse globalmente");
must(layout.includes('import "./visual.css"'),"la base visual consolidada debe cargarse desde el layout raíz");
must(layout.includes('import "./tablet.css"')&&layout.lastIndexOf('tablet.css')>layout.lastIndexOf('visual.css'),"tablet debe adaptarse después de la base visual");
must(!layout.includes("home-v17.css")&&!layout.includes("readability-v210.css")&&!layout.includes("visual-v300.css"),"el runtime no debe recuperar capas CSS históricas versionadas");
must(!exists("app/home-v17.css")&&!exists("app/readability-v210.css")&&!exists("app/visual-v300.css"),"las capas visuales históricas no deben reaparecer");
must(!exists("components/app-sidebar.tsx"),"la sidebar SaaS retirada no debe reaparecer");

// Foundations Financial App 2026.
for(const token of ["--bg:#f4f2ed","--surface:#fbfaf7","--text:#202422","--accent:#6f4e37","--expense:#a64b43","--success:#2d715f","--radius-control:9px","--shadow-float:"])
  must(globals.includes(token),`foundation visual ausente: ${token}`);
for(const token of ['html[data-theme="light"]','html[data-theme="dark"]','--bg:#111412','--accent:#d2a174'])
  must(globals.includes(token),`modo oscuro/claro incompleto: ${token}`);
must(globals.includes("font-variant-numeric:tabular-nums"),"los importes deben conservar alineación numérica tabular");
must(globals.includes(".panel{")&&globals.includes("border-top:1px solid var(--border)")&&globals.includes("border-radius:0;box-shadow:none"),"los paneles base deben estructurarse con divisores, no tarjetas elevadas");
must(controls.includes("background:var(--accent)")&&controls.includes("color:var(--expense)"),"los controles deben consumir la jerarquía y semántica del sistema");
must(visual.includes("--chart-income")&&visual.includes("--chart-expense")&&visual.includes("--chart-accent")&&visual.includes("--chart-grid"),"los gráficos deben compartir semántica visual");
must(!visual.includes("!important"),"visual.css no debe depender de parches !important");
must(tablet.includes('@media (min-width:681px) and (max-width:1180px)')&&!tablet.includes("!important"),"tablet debe resolverse sin overrides !important");

// Navegación propia, sin sidebar genérica.
must(chrome.includes("<AppNavigation/>")&&!chrome.includes("<AppSidebar"),"AppChrome debe montar la navegación de producto actual");
for(const token of ['["Inicio","/"]','["Movimientos","/movimientos"]','["Cuentas","/cuentas"]','["Plan","/plan"]','["Análisis","/analisis"]','["Control","/control"]'])
  must(navigation.includes(token),`falta destino primario: ${token}`);
must(navigation.includes('className="product-primary-nav"')&&navigation.includes('className="mobile-nav"'),"deben existir variantes de navegación desktop y móvil");
must(navigation.includes('aria-expanded={moreOpen}')&&navigation.includes('aria-controls="product-more-menu"'),"el menú secundario debe tener contrato accesible");
must(chromeCss.includes(".product-nav{")&&chromeCss.includes("position:sticky")&&chromeCss.includes(".product-more-menu{"),"el chrome debe usar navegación superior y overlay secundario");
must(chromeCss.includes("@media(max-width:680px)")&&chromeCss.includes(".mobile-nav{position:fixed")&&chromeCss.includes("bottom:0"),"móvil debe usar navegación inferior propia");
must(!chromeCss.includes("grid-template-columns:250px")&&!chromeCss.includes(".sidebar"),"el chrome no debe recuperar la sidebar genérica");
must(intentLink.includes('data-nav-pending={pending?"true":undefined}')&&intentLink.includes('aria-busy={pending||undefined}'),"los enlaces deben conservar feedback de navegación");

// Inicio como narrativa financiera, no muro de widgets.
for(const token of ["home-balance-story","home-balance-primary","home-account-ledger","home-month-pulse","home-flow-section","home-forecast-section","home-decision-grid"])
  must(home.includes(token),`Inicio ha perdido su secuencia narrativa: ${token}`);
must(!home.includes("home-kpis")&&!home.includes("home-account-card")&&!home.includes('className="panel home-'),"Inicio no debe volver al patrón card + KPI + panel");
must(home.includes("getHomeOverview")&&home.includes("CashFlowChart")&&home.includes("dashboard.totalAvailable"),"el rediseño de Inicio debe seguir usando los datos y cálculos canónicos");
must(homeCss.includes(".home-balance-primary>strong")&&homeCss.includes("font-variant-numeric:tabular-nums"),"el saldo principal debe tener jerarquía numérica explícita");
must(homeCss.includes(".home-account-row")&&homeCss.includes("border-bottom:1px solid var(--border)"),"las cuentas deben leerse como ledger continuo");
must(homeCss.includes("@media(max-width:680px)")&&homeCss.includes("@media(max-width:420px)"),"Inicio debe resolver móvil pequeño explícitamente");

// Movimientos: tabla financiera en escritorio, lista compacta en móvil.
must(movementsCss.includes(".movement-table-wrap{overflow:auto;background:transparent;border-block:1px solid var(--border)"),"Movimientos debe conservar tabla plana integrada en escritorio");
must(movementsCss.includes(".movement-card{width:100%;display:flex")&&movementsCss.includes("border-radius:0")&&movementsCss.includes("box-shadow:none"),"Movimientos móvil no debe volver a tarjetas flotantes");
must(movementsCss.includes(".amount{font-weight:780;font-variant-numeric:tabular-nums"),"los importes de movimientos deben quedar alineados y jerarquizados");
must(movementsCss.includes(".status-badge.ok")&&movementsCss.includes(".status-badge.warning")&&movementsCss.includes(".status-badge.edited"),"los estados de movimiento deben conservar semántica visual");
must(movements.includes("Automático según reglas")&&!movements.includes(">Regla automática</option>"),"Cash Flow debe usar lenguaje comprensible");
must(movements.includes("Automático / según origen")&&!movements.includes(">Sin override</option>"),"Conciliación debe evitar terminología técnica");
must(movements.includes("No indicado")&&movements.includes("Sí, se repite")&&movements.includes("No, es puntual"),"Recurrente debe expresarse en lenguaje claro");

// Gráficos y estados.
must(cashFlow.includes("Ingresos / gastos")&&cashFlow.includes("const accY="),"la corrección de doble eje de Cash Flow debe permanecer intacta");
must(cashFlow.includes("Ver datos del gráfico en tabla")&&cashFlow.includes("<caption"),"Cash Flow debe conservar alternativa tabular accesible");
must(visual.includes(".a-bar-current")&&visual.includes(".a-line-current")&&analysis.includes("analysis-chart"),"Análisis debe quedar cubierto por la semántica común de gráficos");
must(visual.includes(".balance-chart-line")&&visual.includes(".balance-chart-area")&&balance.includes("balance-chart-area"),"el histórico de saldo debe quedar cubierto por la base común");
must(visual.includes(".nw-line")&&visual.includes(".nw-grid-line")&&netWorth.includes("nw-chart"),"Patrimonio debe quedar cubierto por la base común");
must(loading.includes('className="route-loading-v300"')&&loading.includes('role="status"'),"la carga privada debe conservar skeleton accesible");
must(visual.includes("prefers-reduced-motion:reduce")&&visual.includes("v300-shimmer"),"el skeleton debe respetar movimiento reducido");

// Contratos documentales y de previsión que el rediseño no puede deteriorar.
must(archive.includes("Hacer foto de ticket")&&archive.includes('capture="environment"'),"Archivo debe permitir foto con cámara trasera");
must(archive.includes("Elegir foto de galería")&&archive.includes("galleryRef"),"Archivo debe permitir elegir una foto existente");
must(archive.includes("Añadir documento")&&archive.includes('accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"'),"Archivo debe mantener importación PDF e imágenes");
must(archiveLib.includes("p_include_archived:true")&&!archive.includes("archive-view-switch"),"Archivo debe seguir siendo una biblioteca única");
must(archive.includes("receipt-table")&&receiptLayout.includes("parseReceiptTsvLayout"),"la reconstrucción de tickets debe conservar tabla y geometría TSV");
must(archiveCss.includes(".receipt-table{")&&archiveCss.includes(".receipt-table-wrap{"),"las columnas del ticket deben seguir siendo responsive");
must(forecastPage.includes("getForecastOverview(365)")&&forecastPage.includes("Un cargo solo se considera real cuando aparece en Movimientos"),"Previsión debe mantener horizonte anual y separación estimación/real");
must(forecast.includes("Mes que quieres revisar")&&forecast.includes("Cargos e ingresos probables")&&forecast.includes("Fecha estimada"),"Previsión debe mantener lectura mensual y fecha aproximada");
must(forecastMigration.includes("historical_pattern_v3")&&forecastMigration.includes("dateVariationDays")&&forecastMigration.includes("'realOnlyAfterTransaction',true"),"el motor probabilístico de previsión debe permanecer intacto");
must(forecastCss.includes(".forecast-month-selector{")&&forecastCss.includes(".forecast-month-summary{"),"la previsión mensual debe conservar jerarquía visual propia");

// PWA y consistencia de identidad.
must(layout.includes("#f4f2ed")&&layout.includes("#111412"),"el chrome PWA dinámico debe compartir la paleta del sistema");
must(manifest.includes('background_color:"#f4f2ed"')&&manifest.includes('theme_color:"#f4f2ed"'),"el manifest debe compartir el fondo canónico claro");

if(failures.length){
  console.error("Audit visual identity 2026 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit visual identity 2026 OK · foundations, navegación, Inicio, Movimientos, gráficos, accesibilidad y contratos funcionales protegidos");
