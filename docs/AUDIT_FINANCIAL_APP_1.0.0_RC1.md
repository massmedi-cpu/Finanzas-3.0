# Financial App — Auditoría integral 1.0.0-rc.1

Fecha: 22/08/2026
Base auditada: `financial-app-rebuild` sobre `bb90eb9ec85bd55b5eb21317711c81734a4a14df`.

## Correcciones aplicadas

- RLS activado en tablas privadas principales y privilegios directos revocados.
- `financial_app_cash_flow` vuelve a ser ejecutable por sesión autenticada mediante su núcleo autorizado.
- Funciones auxiliares internas de derivación cerradas a `anon` y `authenticated`.
- Índices duplicados retirados; FKs relevantes cubiertas.
- Allowlist optimizada para evaluar `auth.jwt()` una vez por consulta.
- Carga histórica inicial normalizada: 3.139 movimientos en `normal`, no falsamente `new`.
- Ciclo de vida para retirar `new` tras visualización preparado mediante `financial_app_mark_new_seen`.
- Versión backend centralizada en `app_meta.app_version` = `1.0.0-rc.1`.
- Todos los módulos públicos auditados devuelven la misma versión.
- Motor de movimientos divididos implementado con total obligatorio igual al movimiento original (tolerancia 0,01 €), historial y original inmutable.
- Sincronizador `financial-app-sync` incorporado al repositorio como código fuente oficial.
- `src/` legado retirado del candidato para impedir contaminación y typecheck accidental.
- CI antigua de Finanzas 3.0 sustituida por gate específico de Financial App.

## Pruebas ejecutadas

- 3.139 movimientos: 0 ID origen duplicados, 0 hashes ausentes, 0 payloads ausentes, 0 cuentas/fechas/importes ausentes.
- 0 discrepancias entre campos normalizados de origen y `source_payload` en ID, cuenta, entidad, identificador, tipo, categoría, subcategoría, conceptos, contraparte, importe, saldo y canal.
- 393 traspasos internos, sin omisiones ni falsos positivos respecto al origen.
- 80 movimientos `Revisar`, exactamente coincidentes con la fuente.
- Cash Flow 2026 = ingresos 10.126,12 €, gastos 9.749,05 €, neto +377,07 €; Análisis devuelve los mismos valores.
- Cuentas y Patrimonio coinciden en activos bancarios: 187.485,25 €.
- División transaccional de prueba de -39,57 € en -19,79 € y -19,78 €: OK; intento con total incorrecto: rechazado; rollback final: 0 divisiones de prueba persistidas.
- RPC principales probados bajo rol `authenticated` con allowlist: dashboard, movimientos, presupuesto, previsión, patrimonio, análisis, archivo y configuración.

## Bloqueadores antes de 1.0.0 estable

- Validación E2E real de Google OAuth y rechazo de cuentas no autorizadas.
- `package-lock.json` reproducible antes de cualquier promoción a `release/**` o `main`.
- Completar interfaz de movimientos divididos.
- Completar OCR automático real y reconstrucción digital identificada como OCR.
- Completar filtros/búsqueda avanzada, gráficos interactivos y drill-down exigidos por el Axioma.
- Completar aplicación efectiva de tema claro/oscuro y auditoría WCAG 2.2 AA.
- Medir rendimiento real y cerrar observabilidad.
- Revisar y eliminar documentación/migraciones históricas ajenas al nuevo proyecto sin perder trazabilidad necesaria.

`1.0.0-rc.1` es un candidato de auditoría; no debe etiquetarse ni publicarse como 1.0.0 estable mientras exista cualquiera de estos bloqueadores.
