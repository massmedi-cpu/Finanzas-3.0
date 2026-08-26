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
const forecastLayout=read("app/prevision/layout.tsx");
const forecastCss=read("app/forecast.css");
const forecastLegacyMigration=read("database/FINANCIAL_APP_3.4.8_FORECAST_PROBABILISTIC_MODEL.sql");
const forecastCalendarMigration=read("database/FINANCIAL_APP_3.6.0_FORECAST_CALENDAR.sql");
const forecastCalendarLib=read("lib/financial/forecast-calendar.ts");
const forecastApi=read("app/api/forecast/route.ts");
const manifest=read("app/manifest.ts");

// Carga y arquitectura CSS.
must(layout.includes('import "./controls.css"'),"los controles compartidos deben cargarse globalmente");
must(layout.includes('import "./visual.css"'),"la base visual consolidada debe cargarse desde el layout raíz");
must(layout.includes('import "./tablet.css"')&&layout.lastIndexOf('tablet.css')>layout.lastIndexOf('visual.css'),"tablet debe adaptarse después de la base visual");
must(!layout.includes("home-v17.css")&&!layout.includes("readability-v210.css")&&!layout.includes("visual-v300.css"),"el runtime no debe recuperar capas CSS históricas versionadas");
must(!exists("app/home-v17.css")&&!exists("app/readability-v210.css")&&!exists("app/visual-v300.css"),"las capas visuales históricas no deben reaparecer");
must(!exists("components/app-sidebar.tsx"),"la sidebar SaaS retirada no debe reaparecer");

// Foundations Financial App 2026.
for(const token of ["--bg:#f4f2ed","--surface:#fbfaf7","--text:#202422","--accent:#0b4f8a","--expense:#a64b43","--success:#2d715f","--radius-control:9px","--shadow-float:","--font-xs:12px","--font-md:16px","--font-3xl:34px"])
  must(globals.includes(token),`foundation visual ausente: ${token}`);
for(const token of ['html[data-theme="light"]','html[data-theme="dark"]','--bg:#111412','--accent:#4c9bff'])
  must(globals.includes(token),`modo oscuro/claro incompleto: ${token}`);
must(globals.includes("font-variant-numeric:tabular-nums"),"los importes deben conservar alineación numérica tabular");
must(globals.includes(".panel{")&&globals.includes("border-top:1px solid var(--border)")&&globals.includes("border-radius:0;box-shadow:none"),"los paneles base deben estructurarse con divisores, no tarjetas elevadas");
must(controls.includes("background:var(--accent)")&&controls.includes("color:var(--expense)"),"los controles deben consumir la jerarquía y semántica del sistema");
must(visual.includes("--chart-income")&&visual.includes("--chart-expense")&&visual.includes("--chart-accent")&&visual.includes("--chart-grid"),"los gráficos deben compartir semántica visual");
must(!visual.includes("!important"),"visual.css no debe depender de parches !important");
must(tablet.includes('@media (min-width:681px) and (max-width:1180px)')&&!tablet.includes("!important"),"tablet debe resolverse sin overrides !important");

// Navegación propia, sin sidebar genérica.
must(chrome.includes("<AppNavigation/>")&&!chrome.includes("<AppSidebar"),"AppChrome debe montar la navegación de producto actual");
for(const token of ['["Inicio","/"]','["Movimientos","/movimientos"]','["Cuentas","/cuentas"]','["Plan","/plan"]','["Previsión","/prevision"]','["Análisis","/analisis"]','["Control","/control"]'])
  must(navigation.includes(token),`falta destino primario: ${token}`);
must(navigation.includes('className="product-primary-nav"')&&navigation.includes('className="mobile-nav"'),"deben existir variantes de navegación desktop y móvil");
must(navigation.includes('aria-expanded={moreOpen}')&&navigation.includes('aria-controls="product-more-menu"'),"el menú secundario debe tener contrato accesible");
must(chromeCss.includes(".product-nav{")&&chromeCss.includes("position:sticky")&&chromeCss.includes(".product-more-menu{"),"el chrome debe usar navegación superior y overlay secundario");
must(chromeCss.includes("@media(max-width:680px)")&&chromeCss.includes(".mobile-nav{position:fixed")&&chromeCss.includes("bottom:0"),"móvil debe usar navegación inferior propia");
must(!chromeCss.includes("grid-template-columns:250px")&&!chromeCss.includes(".sidebar"),"el chrome no debe recuperar la sidebar genérica");
must(!chromeCss.includes("font-size:10.5px")&&chromeCss.includes("font-size:12px")&&chromeCss.includes("font-size:13px"),"la navegación no debe recuperar microtipografía ilegible");
must(intentLink.includes('data-nav-pending={pending?"true":undefined}')&&intentLink.includes('aria-busy={pending||undefined}'),"los enlaces deben conservar feedback de navegación");

// Inicio como narrativa financiera, no muro de widgets ni saldo total protagonista.
for(const token of ["home-accounts-section","home-account-ledger","home-month-pulse","home-flow-section","home-forecast-section","home-decision-grid"])
  must(home.includes(token),`Inicio ha perdido su secuencia narrativa: ${token}`);
must(!home.includes("home-kpis")&&!home.includes("home-account-card")&&!home.includes('className="panel home-'),"Inicio no debe volver al patrón card + KPI + panel");
must(home.includes("getHomeOverview")&&home.includes("CashFlowChart")&&home.includes("APP_VERSION"),"Inicio debe conservar los datos canónicos y mostrar la versión canónica del producto");
must(!home.includes("home.version")&&!home.includes("dashboard.totalAvailable")&&!home.includes("home-balance-primary"),"Inicio no debe mostrar la versión interna del RPC ni el saldo total como protagonista");
must(homeCss.includes(".home-account-row")&&homeCss.includes("border-bottom:1px solid var(--border)"),"las cuentas deben leerse como ledger continuo");
must(homeCss.includes("font-size:clamp(30px,2.6vw,38px)")&&!/font-size:(?:9(?:\.5)?|10(?:\.5)?|11(?:\.5)?)px/.test(homeCss),"Inicio debe usar una escala tipográfica equilibrada, sin microtexto ni titulares desproporcionados");
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

// Contratos documentales.
must(archive.includes("Hacer foto de ticket")&&archive.includes('capture="environment"'),"Archivo debe permitir foto con cámara trasera");
must(archive.includes("Elegir foto de galería")&&archive.includes("galleryRef"),"Archivo debe permitir elegir una foto existente");
must(archive.includes("Añadir documento")&&archive.includes('accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"'),"Archivo debe mantener importación PDF e imágenes");
must(archiveLib.includes("p_include_archived:true")&&!archive.includes("archive-view-switch"),"Archivo debe seguir siendo una biblioteca única");
must(archive.includes("receipt-table")&&receiptLayout.includes("parseReceiptTsvLayout"),"la reconstrucción de tickets debe conservar tabla y geometría TSV");
must(archiveCss.includes(".receipt-table{")&&archiveCss.includes(".receipt-table-wrap{"),"las columnas del ticket deben seguir siendo responsive");

// Previsión 3.6 base: calendario de movimientos esperados, no simulador de saldo.
must(forecastPage.includes("getForecastCalendar(12)")&&forecastPage.includes("Calendario de próximos movimientos")&&!forecastPage.includes("ScenarioSimulator"),"Previsión debe ser un calendario anual de movimientos, sin simulador");
for(const token of ["forecast-calendar-grid","AGENDA DEL MES","Confirmado por un movimiento real","Pasados sin confirmar","Añadir movimiento esperado","Fecha estimada"])
  must(forecast.includes(token),`Previsión calendario ha perdido un contrato: ${token}`);
must(forecast.includes('value="yearly"')&&forecast.includes("Se marcará como recibido cuando aparezca un movimiento bancario compatible"),"Previsión debe permitir anuales y reservar la confirmación al banco");
must(forecastApi.includes("financial_app_forecast_calendar")&&forecastApi.includes("p_months"),"el API de Previsión debe usar el calendario canónico");
must(forecastCalendarLib.includes("actualMovementConfirms")&&forecastCalendarLib.includes("annualInsuranceAndTaxPatterns")&&forecastCalendarLib.includes("ForecastCalendarActual"),"el contrato tipado del calendario debe distinguir estimación y movimiento real");
for(const token of ["financial_app_forecast_calendar","previous_year_seasonal","annualInsuranceAndTaxPatterns","actualMovementConfirms","'received'","interval_months=12"])
  must(forecastCalendarMigration.includes(token),`motor de calendario incompleto: ${token}`);
must(forecastCalendarMigration.includes("revoke all on function financial_app.forecast_calendar_core(date,integer) from public,anon")&&forecastCalendarMigration.includes("grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role"),"el RPC calendario debe conservar su frontera de autorización");
must(forecastLegacyMigration.includes("historical_pattern_v3")&&forecastLegacyMigration.includes("dateVariationDays")&&forecastLegacyMigration.includes("'realOnlyAfterTransaction',true"),"la migración histórica 3.4.8 debe permanecer preservada");
must(forecastCss.includes(".forecast-calendar-grid{")&&forecastCss.includes(".forecast-agenda-item{")&&forecastCss.includes("@media(max-width:680px)"),"el calendario debe resolver escritorio y móvil explícitamente");
must(!forecastLayout.includes("forecast-scenario.css"),"Previsión no debe cargar estilos del simulador retirado");

// PWA y consistencia de identidad.
must(layout.includes("#f4f2ed")&&layout.includes("#111412"),"el chrome PWA dinámico debe compartir la paleta del sistema");
must(manifest.includes('background_color:"#f4f2ed"')&&manifest.includes('theme_color:"#f4f2ed"'),"el manifest debe compartir el fondo canónico claro");

if(failures.length){
  console.error("Audit visual identity 2026 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit visual identity 2026 OK · foundations azules, navegación, Inicio, Movimientos, gráficos, calendario de previsión, accesibilidad y contratos funcionales protegidos");
