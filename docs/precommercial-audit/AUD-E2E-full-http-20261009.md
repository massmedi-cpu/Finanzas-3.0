# AUD-E2E-VAL-001 · recorrido HTTP completo aislado

Versión candidata: 10.0.103. El SHA de ejecución se fija mediante `AUD_VALIDATION_SHA` y se comprueba contra el checkout del runner. Este documento describe el ensayo; sólo un run SUCCESS con los marcadores correspondientes acredita su resultado.

Historia comprobada: el propietario inicia sesión en Next, modifica datos aptos de prueba, los guarda por las API originales, los relee desde PostgreSQL y conserva el original documental y la fuente bancaria.

## Entorno y límites

Supabase CLI 2.120.0 arranca PostgreSQL, GoTrue, PostgREST y Storage reales en localhost con las migraciones originales. Cuatro usuarios y dos workspaces son desechables. No se crea ni consulta ningún proyecto cloud, no hay credenciales de Vercel/Google/Supabase remotos, no se usa una rama Supabase de pago y no se suben sesiones, tokens, documentos, trazas ni dumps.

Las API, el SDK `@vercel/oidc`, la resolución de cookies y los handlers de negocio son originales. Para arrancar el gateway HTTP fuera de Vercel, se genera una copia temporal de `index.ts` con **exactamente dos sustituciones**: JWKS por una clave RSA desechable local y binding del servidor a localhost. Se registra el hash del código original; el original permanece intacto y la copia se elimina al terminar. Se verifican firma, expiración, issuer/audience/owner/project/subject y la prohibición de escritura/exportación Preview. **La clave de prueba no es el firmante oficial de Vercel**. Su integración oficial requiere el postflight de la aplicación publicada.

Un adaptador de red exclusivo del proceso de prueba dirige las URL fijas del gateway y Storage a los servidores locales. Las rutas de Next conservan sus restricciones de host HTTPS y ruta firmada; la respuesta real de Storage se traduce a ese origen canónico antes de pasar por ellas. El adaptador bloquea los demás destinos externos. No devuelve fixtures como respuesta a API financieras: cookies, HTTP, SQL, OCR y bytes proceden de los servicios reales.

## Matriz

| Área | Verificación |
| --- | --- |
| Fronteras | Sesión real, cookies, owner/member, aislamiento, firma/claims inválidos, Preview read-only |
| Presupuestos | Septiembre/octubre con respuesta en menos de 30 s, manual 1732/0/null, guardado y relectura |
| Configuración/reglas | Categoría y alias persistidos, regla creada en UI y recargada, simulación sin cambios y precedencia manual |
| Movimientos | Edición masiva limitada, reparto −1000/−732 sobre −1732, rechazo de suma inválida y relectura |
| Recurrentes | Cuatro ocurrencias, confirmación idempotente, ignorar/reactivar y relectura |
| Previsión | Regeneración explícita, eventos manuales, negativo/cero/positivo, escenarios sobre snapshot real, excluir/revertir, conflicto de revisión antigua, conciliación y horizonte |
| Documentos | Upload privado real, descarga binaria y hash, OCR Tesseract por la ruta Next, persistencia exacta cotejada en SQL, revisión humana, asociación/desasociación del objetivo |
| Borradores/designación | Guardar y recargar en UI, fallo de red conserva borrador, teclado/Descartar sin escritura, owner review, exclusión ordinaria, vista Pruebas y reversión |
| Exportación | Descarga real JSON, datasets prometidos, sin credenciales ni binarios |
| UI | 21 rutas: 14 módulos y 7 áreas de Configuración; 360/390/768/820/1024/1348/1440 px; claro/oscuro; datos reales en las rutas financieras; sin overflow ni excepciones de página |
| Preferencias/PWA | Guardado local y recarga, foco/teclado, privacidad al perder foco, worker real, fallo de lectura offline sin caché privada y recuperación |

La fuente sintética se coteja por hash completo. Los campos bancarios de movimientos se cotejan excluyendo únicamente merchant/category/updated_at, que la aplicación modifica legítimamente al aplicar reglas explícitas. Ninguna prueba escribe en el banco o Drive originales.

Los ensayos existentes de cobertura financiera, contraste, navegación contextual, errores/demoras, OCR heterogéneo y responsive complementan esta matriz. El ensayo de upgrade/reversión sobre el backup real se mantiene separado. La revisión humana del F11 real quedó confirmada por el propietario el 09/10/2026; aplicar su designación en Producción sigue siendo una acción del release final.

## Primer recorrido y corrección

El [run 37887187836](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/37887187836), HEAD `adb99694`, terminó FALLIDO: 3/14 casos pasaron. El recorrido real detectó `forecast_write_conflict` en una exclusión recién leída. El serializador timestamptz de postgres.js 3.4.7 convierte parámetros mediante `Date.toISOString()` y pierde microsegundos. Excluir y conciliar ahora enlazan la revisión como texto antes del cast PostgreSQL; se conserva la igualdad exacta y una revisión antigua debe seguir devolviendo 409. No se relaja el control de concurrencia ni se cambia SQL.

Se corrigen también defectos del ensayo: `Response.status` numérico, host local coherente con el URL reconstruido por Next y la comprobación CSRF, selección del textarea de metadatos dentro de su formulario, y Cash Flow como renderizado de servidor, comprobando que sus lecturas reales no terminan en avisos de datos no disponibles. El siguiente run debe repetir todos los casos; estos cambios no convierten el fallo en aprobación.


## Segundo recorrido y renderizado de servidor

El [run 37889447323](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/37889447323), HEAD `09016086`, terminó FALLIDO: 7/14 casos pasaron. Pasaron las fronteras HTTP, la persistencia financiera, recurrentes/Previsión (incluidos exclusión recién leída, revisión antigua rechazada y conciliación), documentos/exportación y preferencias/PWA. Las siete pasadas de pantalla se detenían en Análisis esperando un GET del navegador que no existe cuando el snapshot inicial llega desde el servidor.

Análisis, Comparador, Cash Flow y Previsión se verifican ahora por su resumen cargado desde los handlers reales de servidor y la ausencia de su estado de indisponibilidad. Se mantienen los GET originales en las rutas que sí leen desde el navegador. Análisis/Comparador/Cash Flow usan septiembre con movimientos y Previsión usa octubre con los eventos persistidos por el recorrido. Los siete anchos y ambos temas siguen exigiendo cero overflow y cero excepciones de página. El siguiente run completo, incluido el cotejo SQL final del OCR y de las fuentes originales, debe terminar SUCCESS para aceptar el candidato.


## Tercer recorrido y Cash Flow móvil

El [run 37891179198](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/37891179198), HEAD `ecb3f60b`, terminó FALLIDO: 12/14 casos pasaron. Los cinco recorridos de 768–1440 px recorrieron las 21 rutas en ambos temas con backend real y sin overflow ni excepciones. Cash Flow con datos conciliados se desbordaba a 734 px en viewports de 360/390 px: la tabla nativa de apoyo, oculta visualmente con ancho 1 px, conservaba su ancho intrínseco.

La clase de ocultación pasa a un contenedor de bloque que recorta ese ancho, manteniendo la tabla nativa, caption y todas las filas accesibles. El recorrido exige su presencia en el árbol accesible, cuatro encabezados y los 30 días de septiembre. Conserva las comprobaciones de ancho de documento/cuerpo y añade diagnósticos de geometría sin textos financieros. No cambia datos, cálculos ni lógica de la gráfica. La aceptación exige nuevamente el run completo SUCCESS y el cotejo SQL final.


## Cuarto recorrido y Presupuestos móvil

El [run 37892129714](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/37892129714), HEAD `24392a5a`, terminó FALLIDO: 12/14 casos pasaron. Cash Flow pasó ya a 360/390 px con sus cuatro encabezados y 30 días accesibles. En ambos anchos el recorrido avanzó hasta Presupuestos, cuyos paneles cargados forzaban un ancho de página de 435 px por los mínimos intrínsecos de sus grids y filas de tarjetas. Las cinco anchuras de 768–1440 px volvieron a pasar todas las rutas.

Contenido y rejilla móvil principal usan tracks con mínimo cero; los paneles pueden contraerse, el resumen conserva columnas ajustables (una hasta 400 px) y títulos/estados pueden pasar de línea. No se recorta la página ni se ocultan controles. El ensayo registra todos los desbordamientos de una pasada con aserciones soft que siguen haciendo FALLAR el caso; sólo emite el marcador responsive con overflow=0 cuando no hay errores. Así se revisan también las rutas posteriores antes de aceptar 14/14 y el cotejo SQL final.

Los commits concurrentes `9cce944d` y `14dd99b7` añadieron mínimos cero y el breakpoint compacto de 400 px. Se conservan sus cambios al integrar el salto de filas y la pasada completa de diagnóstico.
