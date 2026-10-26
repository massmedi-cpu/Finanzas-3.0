# REC-REL-415 — Inventario de lanzamiento y acceso estrictamente personal

**Candidato auditado:** PR #619, fuente de verdad GitHub `f3ffaa20a047412527b8e201dd0234fa30eb83fa`, 24 rutas de pantalla, 43 endpoints Next.js, navegación compartida y clientes principales. Este documento describe lo que existe EN EL CÓDIGO; los módulos no probados en producción no se declaran publicados. El despliegue deberá usar SHA exacto posterior al cierre de esta auditoría. Sin cambios a saldos ni movimientos.

## 1. Inventario de navegación
`app/navigation-items.ts`: 14 entradas codificadas; **13 quedan visibles** en el perfil candidato `NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS=deferred`: Inicio (/), Cash Flow (/cash-flow), Primeros pasos (/onboarding), Para revisar (/review), Alertas (/alerts), Movimientos (/transactions), Análisis (/analysis), Comparador (/compare), Cuentas (/accounts), Presupuestos (/budgets), Recurrentes (/recurrences), Previsión (/forecast), Configuración (/configuration). **Documentos (/documents) se filtra completamente** del menú.

`app/mobile-navigation.tsx`: dock con Inicio, Movimientos y Análisis + un favorito compatible (por defecto Para revisar) + Más; se usa menú secundario y existe selección `Acceso favorito`. Sus candidatos originales son Para revisar, Cash Flow, Comparador, Cuentas, Presupuestos, Recurrentes, Previsión y Documentos, pero la última opción se FILTRA con el mismo flag. No existe una entrada de multiusuario. Pantalla de acceso (/login) excluye la navegación global.

`app/configuration/configuration-area-nav.tsx`: pestañas **Cuentas y categorías, Preferencias, Comercios y alias, Reglas, Fuente bancaria, Apariencia, Datos y privacidad**. No contiene pestañas de miembros, invitaciones ni roles.

## 2. Mapa exhaustivo de 24 rutas de página
| Ruta | Perfil lanzamiento | Controles / finalidad comprobados en cliente principal |
|---|---|---|
| `/` | Visible | Inicio; Actualizar datos; estado/fuentes, saldos por cuenta, gasto, últimos 12 meses, próximos hechos y movimientos |
| `/accounts` | Visible | Cuentas; detalle, conciliación, actividad mensual, ver/ocultar archivadas, movimientos |
| `/alerts` | Visible | Alertas activas; actualizar, abrir incidencia |
| `/analysis` | Visible | Análisis; filtros, periodos, selección de cuentas, enlaces de contexto con otros módulos |
| `/budgets` | Visible | Presupuestos; mes por query, definir/editar/quitar límite, guardar, refrescar referencia, filtros y volver a consultar |
| `/cash-flow` | Visible | Cash Flow; fecha y detalle de calendario, estado de previsiones |
| `/compare` | Visible | Comparador; rango principal/referencia, periodos equivalentes, ejecutar comparación |
| `/configuration` | Visible | Editor de cuentas/categorías; crear/editar/ordenar/archivar, filtrar y fusionar categorías; enlaces de ajustes |
| `/configuration/accounts` | Alias | Redirección `/configuration?tab=accounts` |
| `/configuration/categories` | Alias | Redirección `/configuration?tab=categories` |
| `/configuration/appearance` | Visible | Preferencias de aspecto, tema, densidad y movimiento; restablecer |
| `/configuration/data` | Visible | Datos y privacidad; exportación, seguridad y eliminación con verificaciones del servidor |
| `/configuration/merchants` | Visible | Comercios y alias; crear, editar, activar/archivar, añadir/borrar alias y probar equivalencias |
| `/configuration/preferences` | Visible | Preferencias generales; inicio, privacidad, fuente al abrir y restablecer |
| `/configuration/rules` | Visible | Reglas de categorización; crear/editar/activar/desactivar, aplicar, buscar y simular |
| `/configuration/source` | Visible | Fuente bancaria; comprobar sin importar, conciliar y actualizar desde Google |
| `/configuration/source/diagnostics` | Visible deep link | Fuente bancaria; validar, actualizar y desconectar Google; leer último intento |
| `/documents` | **Oculta** | `notFound()` en servidor; ningún auto-sync; inaccesible desde navegación |
| `/forecast` | Visible | Previsión; recurrentes, excluir/restaurar, desvincular, conciliar y añadir previsión |
| `/login` | Público limitado | Entrada con correo y contraseña; redirección posterior validada; sin shell privado |
| `/onboarding` | Visible | Primeros pasos progresivos, comprobación de conexión e instrucciones |
| `/recurrences` | Visible | Patrones recurrentes; confirmar, ignorar, archivar, reactivar y recalcular |
| `/review` | Visible | Elementos pendientes de revisar y enlaces a módulos |
| `/transactions` | Visible | Movimientos; filtros, paginación, selección masiva, editar, categorizar, repartir, duplicado y transferencias; guardado/recuperación sin duplicar |

Los controles anteriores proceden de los componentes principales, no son una aprobación de que todos los recorridos funcionen autenticados en producción. El perfil sí cuenta con CI Playwright (89 successes/1 skipped) para el SHA base, incluidas 1937 pruebas de regresión integradas por matriz sin flaky.

## 3. Endpoints HTTP: inventario de los 43 archivos app/api/**/route.ts
**Sesión/publicación (4 archivos):** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/build`, `POST /api/telemetry/client` (telemetría pública de cliente, no datos financieros).
**Lectura financiera y privacidad (11 archivos):** `GET /api/analysis`, `GET /api/analysis/source-freshness`, `GET /api/compare`, `GET /api/dashboard`, `GET /api/dashboard/analysis`, `GET /api/category-identity`, `GET /api/financial`, `GET /api/search`, `GET /api/data/export`, `GET /api/data/deletion-impact`, `GET /api/data/deletion-readiness`.
**Finanzas / CRUD (8 archivos):** `GET,POST,PATCH /api/budgets`, `GET,POST /api/configuration`, `GET,POST /api/forecast` y `PATCH /api/forecast`, `GET,POST /api/merchants`, `GET,POST,PATCH /api/recurrences`, `GET,POST /api/rules`, `GET,PATCH,PUT,POST /api/transactions`, `GET,POST /api/data/deletion`.
**Banco Google (6):** `GET /api/source/google/callback`, `GET /api/source/google/connect`, `GET /api/source/google/postflight`, `POST /api/source/google/preflight`, `GET,DELETE /api/source/google/status`, `GET,POST /api/source/google/sync`. **Este último POST continúa con la operación de sincronización AP5 todavía pendiente, aunque el control se vea en UI.**
**Health/diagnóstico del backend (8):** `GET /api/health/configuration-persistence`, `GET /api/health/data-quality`, `GET /api/health/foundations`, `GET /api/health/google-oauth-vault`, `GET /api/health/google-oauth`, `GET /api/health/persistence`, `GET /api/health/source-ingestion`, `GET /api/health/source-runtime`.
**Documentos pospuestos (6):** `GET,POST,PATCH /api/documents`, `GET,DELETE /api/documents/delete`, `GET /api/documents/download`, `POST /api/documents/drive-sync`, `GET,PATCH /api/documents/ocr-review`, `GET,POST /api/documents/ocr`.
**Observación:** hay 43 rutas de endpoint, no se deben contar las expresiones anteriores por grupos erróneos: el recuento canónico es el árbol GitHub. Además `/api/telemetry/client` ya figura en sesión/publicación y `/api/data/deletion` en el bloque de datos.

## 4. Tabla de política de publicación
| Elemento | Interfaz candidata | Servidor | Estado |
|---|---|---|---|
| Núcleo de finanzas y todos sus cálculos | Visible | Gateway v86 real aún no cambiado; candidato v3 separado | **Mantener** / falta AP2 y publicación |
| Fuente oficial Google Sheets | Visible, solo lectura origen | Preflight obligatorio y checksum/22 campos; reconciliar +20 pendiente | **Mantener bajo puerta AP5** |
| Documentos completos | Ocultos | Route `/documents` responde 404; APIs de documentos deben denegar `feature_deferred` | **Diferir** |
| OCR | Oculto | Flag `NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_OCR=deferred` + denegación backend | **Diferir** |
| Drive Sync documental | Oculto | Flag `NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DRIVE_SYNC=deferred` + denegación backend; distinto del Google Sheets bancario | **Diferir** |
| Usuarios múltiples | No hay UI de invitaciones | Gate personal REC-AP2-415 exige propietario único y rechaza `member` | **No incluir** |
| PWA y preferencia móvil | Visible | Datos de preferencia locales, no sincronizan bancos por sí mismos | **Mantener** |

**Riesgos sin falsear:** La presencia de método o botón no garantiza que todas las funciones tengan prueba manual real; algunos GET de diagnóstico usan sus propias comprobaciones internas, por lo que ningún `auth:false` inferido de un patrón textual permite declararlo públicamente accesible. AP2 autenticado con segundo sujeto aún no validado en la nube; AP5 import +20 no ejecutado. No desplazar estas puertas por esta auditoría.

## 5. Cumplimiento single-user / código
`src/domain/workspace-context.ts` añade predicado puro `isSingleOwnerWorkspaceAccess(role,membershipCount)`. Solo acepta exactamente owner/1. `supabase/functions/financial-app-db-gateway/workspace-context.ts` lo comprueba después de validar la sesión Supabase y leer su membresía pero **antes** de `SET ROLE` y GUC de workspace; devuelve `workspace_access_denied` 403 sin conceder conexión de negocio a `member`, miembro adicional o conteo inválido. `tests/e2e/source-metadata-auth-boundary.spec.ts` cubre rechazo de múltiples roles/membresías y secuencia obligatoria.

Esta mejora se incorpora a la **PR candidata**, nunca a producción antes de terminar CI y verificar un propietario autenticado. Base de datos actual: exactamente un owner activo en un único workspace, cero otros miembros. Mantener la restauración cifrada y la reversión de gateway.

## REC-REL-489 · 26/10/2026 · Sin DML temporal desde vistas previas compartidas

La vista previa 10.0.104 usa la función Edge candidata en el MISMO proyecto/base Supabase de producción, por lo que un test transaccional de escritura no es una operación de lectura aunque acabe en ROLLBACK. Se ha detectado que PREVIEW_READ_ONLY_ACTIONS incluía test.transaction_split_engine; su implementación llama a financial_app.save_transaction_split en una transacción antes de forzar rollback, eligiendo un movimiento financiero existente. No había evidencia de que la PR/preview haya invocado esa acción contra datos reales: se documenta como exposición potencial, no como alteración observada.

Se retira únicamente esa operación de la allowlist de vista previa, dejando disponibles las lecturas financieras necesarias. El manejador de prueba queda conservado para ensayos legítimos sobre BD desechables, pero ya no se permite alcanzarlo con identidad preview en el gateway de la candidata. La regresión REC-REL-489 en tests/unit/release-gateway-target.test.mjs revisa la lista ejecutable y sus llamadas SQL para que un futuro cambio no vuelva a clasificar esta mutación como solo lectura.

**Alcance:** se modifica solo el código de la PR #619. El gateway Edge candidato v4 ya desplegado en el proyecto real NO se actualiza en este bloque; hasta su despliegue autorizado el endurecimiento no está activo en la nube. No se crean proyectos, no hay DML, importación bancaria, login propietario cloud ni promoción. El gate AP2 autenticado real sigue pendiente.

## REC-REL-490 · 26/10/2026 · Rectificación del verificador legado

La primera compilación del endurecimiento REC-REL-489 detectó un fallo REAL de postbuild en scripts/verify-axioma25-splits-10.0.83.mjs: la regla antigua "preview-seguro" exigía que test.transaction_split_engine estuviera autorizado por PREVIEW_READ_ONLY_ACTIONS. Esto contradice el aislamiento actual, porque esa acción ejecuta save_transaction_split sobre un movimiento real y solo después fuerza rollback. La CI y Vercel del SHA 8422e3c fallaron al ejecutar el gate antiguo; NO se declaró la candidata certificada y no se publicó.

REC-REL-490 cambia el gate para analizar específicamente el contenido de la allowlist: debe incluir transaction.split_detail (SELECT) y NO contener test.transaction_split_engine (DML transitorio), además de exigir el rechazo previo 403 preview_production_write_forbidden. No elimina el test de repartos del handler ni la prueba en PostgreSQL efímero; conserva todos los demás controles acumulativos del Axioma 25. El guard y la regresión REC-REL-489 ahora protegen la misma regla de seguridad. Requiere ejecutar la nueva CI completa y preview exacta. No afecta al gateway Edge v4 ya desplegado, que permanece intacto hasta una intervención posterior autorizada.
