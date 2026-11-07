# Alcance de candidata · 23/10/2026

B1: cierre completo de Documentos mientras AP1 no está acreditada en producción. Se conserva el código y el producto estable; NO-GO de publicación hasta cerrar el núcleo bancario y los demás gates.

## Perfil de compilación

`NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS=deferred` debe estar presente DURANTE `npm run build`. El build candidato debe acreditar en `/api/build.releaseFeatures` los tres valores `documents=false`, `documentOcr=false`, `documentDriveSync=false`. Next inyecta esta variable pública en cliente y servidor; no basta cambiarla después de compilar. El corte padre prevalece sobre los flags OCR/Drive habilitados. La configuración por defecto conserva las regresiones del producto anterior. Una futura producción debe compilar y probar explícitamente el perfil reducido.

## Inventario de páginas

24 páginas físicas: 21 destinos canónicos de producto, dos alias de Configuración y login. El perfil reducido conserva 20 destinos canónicos. Clasificar como conservado no equivale a aceptación funcional completa.

| Ruta | Alcance |
|---|---|
| `/accounts` | OBLIGATORIA |
| `/alerts` | COMPLEMENTARIA CONSERVADA |
| `/analysis` | OBLIGATORIA |
| `/budgets` | COMPLEMENTARIA CONSERVADA |
| `/cash-flow` | OBLIGATORIA |
| `/compare` | OBLIGATORIA |
| `/configuration/accounts` | ALIAS COMPATIBLE |
| `/configuration/appearance` | OBLIGATORIA |
| `/configuration/categories` | ALIAS COMPATIBLE |
| `/configuration/data` | OBLIGATORIA |
| `/configuration/merchants` | OBLIGATORIA |
| `/configuration` | OBLIGATORIA |
| `/configuration/preferences` | OBLIGATORIA |
| `/configuration/rules` | OBLIGATORIA |
| `/configuration/source/diagnostics` | OBLIGATORIA |
| `/configuration/source` | OBLIGATORIA |
| `/documents` | DIFERIDA: página no disponible; no monta cliente ni DriveAutoSync |
| `/forecast` | OBLIGATORIA |
| `/login` | OBLIGATORIA |
| `/onboarding` | COMPLEMENTARIA CONSERVADA |
| `/` | OBLIGATORIA |
| `/recurrences` | COMPLEMENTARIA CONSERVADA |
| `/review` | COMPLEMENTARIA CONSERVADA |
| `/transactions` | OBLIGATORIA |

## Inventario completo de handlers HTTP

43 handlers. La tabla recoge los métodos explícitos; HEAD/OPTIONS automáticos no añaden consultas documentales. La autorización independiente permanece.

| Endpoint | Métodos | Perfil reducido |
|---|---|---|
| `/api/analysis` | GET | Conservado |
| `/api/analysis/source-freshness` | GET | Conservado |
| `/api/auth/login` | POST | Conservado |
| `/api/auth/logout` | POST | Conservado |
| `/api/budgets` | GET, POST, PATCH | Conservado |
| `/api/build` | GET | Procedencia y flags efectivos públicos; sin secretos |
| `/api/category-identity` | GET | Conservado |
| `/api/compare` | GET | Conservado |
| `/api/configuration` | GET, POST | Conservado |
| `/api/dashboard/analysis` | GET | Conservado |
| `/api/dashboard` | GET | Conservado |
| `/api/data/deletion` | GET, POST | Conservado |
| `/api/data/deletion-impact` | GET | Conservado |
| `/api/data/deletion-readiness` | GET | Conservado |
| `/api/data/export` | GET | Conservado |
| `/api/documents/delete` | GET, DELETE | 404 feature_deferred antes de leer datos |
| `/api/documents/download` | GET | 404 feature_deferred antes de leer datos |
| `/api/documents/drive-sync` | POST | 404 feature_deferred antes de leer datos |
| `/api/documents/ocr` | GET, POST | 404 feature_deferred antes de leer datos |
| `/api/documents/ocr-review` | GET, PATCH | Verifica sesión/workspace primero: 401/403 sin permiso, 404 autorizado; sin historial ni escritura |
| `/api/documents` | GET, POST, PATCH | 404 feature_deferred antes de leer datos |
| `/api/financial` | GET | Conservado |
| `/api/forecast` | GET, POST, PATCH | Conservado |
| `/api/health/configuration-persistence` | GET | Conservado |
| `/api/health/data-quality` | GET | Conservado |
| `/api/health/foundations` | GET | Conservado |
| `/api/health/google-oauth` | GET | Conservado |
| `/api/health/google-oauth-vault` | GET | Conservado |
| `/api/health/persistence` | GET | Conservado |
| `/api/health/source-ingestion` | GET | Conservado |
| `/api/health/source-runtime` | GET | Conservado |
| `/api/merchants` | GET, POST | Conservado |
| `/api/recurrences` | GET, POST, PATCH | Conservado |
| `/api/rules` | GET, POST | Conservado |
| `/api/search` | GET | Sin document.list ni enlaces/resultados documentales; corte no genera partial artificial |
| `/api/source/google/callback` | GET | Conservado |
| `/api/source/google/connect` | GET | Conservado |
| `/api/source/google/postflight` | GET | Conservado |
| `/api/source/google/preflight` | POST | Conservado |
| `/api/source/google/status` | GET, DELETE | Conservado |
| `/api/source/google/sync` | GET, POST | Conservado |
| `/api/telemetry/client` | POST | Conservado |
| `/api/transactions` | GET, PATCH, PUT, POST | Rechaza hasDocument/documentQuery/ocrQuery con 404 |

## Superficies y acciones cerradas

- Navegación escritorio/móvil; favorito previo vuelve a Para revisar; selector de favoritos excluye Documentos.
- Búsqueda global sin consulta documental, enlaces ni resultados documentales de respuestas antiguas. Texto de ayuda sin anuncio de facturas.
- Para revisar y Alertas no consultan documentos ni muestran avisos documentales por su aplazamiento.
- Movimientos elimina filtros documentales/OCR y no los activa desde URL antigua; API rechaza selectores directos.
- Lista/detalle, abrir/descargar originales, firma/finalización de subida, lote Drive, metadatos, designación de prueba, asociar/desasociar/archivar y preflight/borrado quedan cerrados.
- OCR, historial y confirmación, y autoarranque Drive quedan subordinados al corte padre.
- No hay crons Vercel configurados. El autoarranque documental estaba en DriveAutoSync y no se monta. Las APIs de fuente Google bancaria permanecen intactas.

La exportación personal conserva los metadatos históricos existentes. No se borra información ni se revocan URLs firmadas anteriormente. El cierre no certifica AP1 ni modifica el gateway o la producción actual.

## Pruebas y límites

Los cinco casos REC-REL-371–375 del recorte previo no estaban seleccionados en la matriz principal: ahora se incluyen junto a REC-REL-379–382 y se exigen en el guard. El job deferred-document-release compila el perfil reducido y ejecuta REC-REL-383–385 sobre el build optimizado, con capturas en 360/390/768/1440, claro/oscuro.

Los recorridos visuales usan APIs sintéticas no disponibles: prueban el cierre, navegación y estado de error, no cifras reales ni persistencia cloud. Resultados terminales, SHA y deployment: consultar el handoff del bloque.

## Bloqueos restantes

Fuente consultada en modo lectura: 3208 IDs, 3191 corriente y 17 ahorro, sin duplicados por pestaña. DB consultada read-only: 3188 movimientos y fuentes, 32/32 tablas con RLS y cero buckets públicos. Gateway real v86. Las 20 pendientes y la diferencia representacional de Fecha siguen requiriendo reconciliación estricta de todos los campos, respaldo, gateway v3 compatible, importación controlada y postflight.

AP2 cloud con dos identidades, QA final autenticada/visual del núcleo, CI terminal exacta y backup fresco/restore/rollback/integración segura siguen abiertos. AP1 y OCR GOLD 17+8 quedan para una reactivación futura de Documentos. No publicar hasta cumplir gates.
