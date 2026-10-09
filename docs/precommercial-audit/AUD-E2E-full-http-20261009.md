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
