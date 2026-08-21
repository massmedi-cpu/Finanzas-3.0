# Trazabilidad de requisitos — Finanzas 3.0 V3.0.0

Documento canónico de trazabilidad para el candidato V3.0.0. Los documentos con versión en su nombre (`*_V1.*`, `*_V2.*`) se conservan como evidencia histórica y no sustituyen este estado vigente.

| Requisito permanente | Implementación / evidencia V3.0.0 | Estado |
|---|---|---|
| Fuente bancaria de solo lectura | Bridge/ingesta solo lee la fuente; las correcciones viven en la capa privada | Cumplido |
| No modificar datos originales | Overrides, splits, reglas, cierres, objetivos, escenarios y demás preferencias se almacenan fuera de la fuente bancaria | Cumplido |
| Traspasos internos fuera de ingresos/gastos | Motor financiero + RPC normalizadas + regresiones de dominio | Cumplido |
| Transferencias externas conservadas | Regresión automatizada diferencia traspaso interno de transferencia real | Cumplido |
| Edición reversible | `finance_v3_movement_overrides` y restauración | Cumplido |
| División reversible | `finance_v3_movement_splits`, validación y restauración | Cumplido |
| División cuadra con original | Validación frontend/backend/RPC con tolerancia monetaria | Cumplido |
| Presupuestos | Motor y lectura analítica normalizada | Cumplido |
| Recurrentes | Preferencias privadas + motor de previsión | Cumplido |
| Previsión y escenarios | Motor determinista, eventos futuros y escenarios | Cumplido |
| Previsión de largo plazo | Proyección por ventanas acotadas, sin truncar horizontes 12/24/36/60 meses | Cumplido |
| Objetivos | Objetivos privados + viabilidad, aportación requerida y desviación | Cumplido |
| Informes | RPC agregadas para anual, mensual, trimestral, categorías y comparativas | Cumplido |
| Calidad/duplicados/revisión | Centro de revisión sobre vista efectiva normalizada | Cumplido |
| Correcciones privadas afectan derivados | Precedencia efectiva `split > manual > regla > fuente` | Cumplido |
| Cierre mensual | Evaluación, bloqueo por incidencias, snapshot de cierre, drift y reapertura auditada | Cumplido |
| Reglas automáticas reversibles | Preview obligatorio, prioridad, pausa/eliminación y auditoría | Cumplido |
| Explicabilidad | Procedencia visible y sugerencias conservadoras con evidencia/confianza | Cumplido |
| Centro de control | Estado estructural, checksums, calidad, inventario de capas privadas y auditorías persistentes | Cumplido |
| Copias privadas | Exportación, preview de restauración, compatibilidad, confirmación y restore atómico | Cumplido |
| No mostrar cifras parciales | Si falta una capa necesaria para exactitud, se devuelve error explícito | Cumplido |
| Acceso privado | Login, cookie privada, proxy y validación backend | Cumplido |
| Autorización fail-closed | Edge Functions históricas y V3 deniegan ante 401/403, 5xx, fallo de red o excepción | Cumplido |
| Sin secretos en cliente/repositorio | Secretos y service role solo en backend; `.env.example` no contiene credenciales reales | Cumplido |
| RLS deny-by-default | Tablas privadas `finance_v3_*` protegidas; sin acceso público directo | Cumplido |
| RPC privilegiadas no públicas | Ejecución restringida al backend/service role | Cumplido |
| Responsive/mobile-first | Sistema visual con breakpoints y tablas desplazables | Cumplido; gate visual final en preview |
| Estados de carga/error | `app/loading.tsx` y estados explícitos por superficie | Cumplido |
| Evitar prefetch pesado | Navegación pesada con `prefetch={false}` donde corresponde | Cumplido |
| Evitar reprocesado de la fuente sin cambios | Bridge V4 usa `modifiedTime` y snapshot/caché | Cumplido |
| Lecturas paralelas | `Promise.all` en superficies con dependencias independientes | Cumplido |
| Arquitectura normalizada | Movimientos, cuentas, resumen y analítica principal leen SQL/RPC normalizado | Cumplido |
| Paginación real | Movimientos usa cursor/keyset y mantiene payload/DOM acotados | Cumplido |
| Analítica sin descargar todo el histórico | Informes, presupuestos y revisión usan RPC agregadas | Cumplido |
| Rendimiento de previsión | Proyección segmentada por ventanas y detalle visual acotado | Cumplido |
| Índices de soporte | Índice de cobertura para eventos de reglas incluido en migración V3 | Cumplido |
| Dependencias reproducibles | Versiones fijadas, `package-lock.json`, Node 22 y `npm ci` | Cumplido |
| CI de regresión | Invariantes, dominio, largo plazo, cierre, reglas, explicabilidad, control, backup, seguridad, TypeScript, build y smoke | Cumplido en HEAD previo; debe repetirse tras cualquier cambio |
| Rollback/checkpoints | Checkpoints y ramas de release/auditoría conservan estados previos | Cumplido |
| Documentación canónica | Axiomas, arquitectura, esta trazabilidad, test matrix y documentación de release | Cumplido V3.0.0 |

## Evidencia de datos del candidato V3.0.0 — 2026-08-21

- Snapshot validado: **3.135 movimientos**.
- Modelo normalizado: **3.135 movimientos**.
- Checksum snapshot/normalizado: **idéntico**.
- Segunda sincronización idempotente: sin altas ni cambios inesperados.
- Cifras financieras 2026: sin regresiones frente a la referencia validada.
- Fuente bancaria original: sin modificaciones.

## Gate final obligatorio V3.0.0

V3.0.0 no se considera producción hasta completar, en este orden:

1. CI verde sobre el SHA final exacto.
2. Un único preview Vercel del SHA final.
3. Deployment `READY` en la configuración esperada.
4. `/api/health` devuelve exactamente `3.0.0`.
5. Login y rutas críticas funcionan sobre el build desplegado.
6. Runtime sin errores ni eventos fatales atribuibles al release.
7. Verificación visual responsive del candidato.
8. Promoción a `main` solo después de superar los gates anteriores.
9. Producción sobre el SHA fusionado.
10. `/api/health` de producción devuelve `3.0.0` y navegación crítica validada.

Si falla exactitud, seguridad o una dependencia necesaria, el resultado correcto es **fallo explícito y ausencia de datos parciales**, nunca degradación silenciosa.
