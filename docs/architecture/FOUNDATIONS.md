# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Esquema persistente: definido como migración reproducible, todavía no aplicado

## Principios ya materializados en código

1. La fuente bancaria es externa, inmutable y de solo lectura.
2. Los movimientos se modelan en tres capas:
   - registro original de origen;
   - transacción procesada/normalizada;
   - modificación explícita del usuario.
3. Las modificaciones del usuario no sobrescriben el dato bancario original.
4. El usuario puede corregir o vaciar expresamente categoría/comercio sin perder la distinción entre “sin override” y “valor borrado por el usuario”.
5. Las transferencias internas no se consideran ingreso/gasto por defecto.
6. Sincronización futura: incremental, idempotente y conservadora de overrides.
7. La identidad de una fila bancaria y su fingerprint son deterministas para impedir reimportaciones silenciosas.
8. Una sola capa central de formato regional es-ES.
9. Dinero en lógica de aplicación: céntimos enteros seguros.
10. Moneda visual: EUR con exactamente dos decimales.
11. Fecha visual: DD/MM/AAAA en zona Europe/Madrid.
12. Diseño y responsive nacen desde el primer componente mediante tokens globales.
13. Build, rama y commit son identificables desde la propia aplicación y `/api/build`.
14. Cuentas y categorías tienen políticas de unicidad, reordenación e integridad jerárquica antes de persistir.
15. La build ejecuta las comprobaciones de fundamentos y falla si alguna deja de cumplirse.

## Fuente lógica de verdad

| Dominio | Fuente lógica |
| --- | --- |
| Cuentas | `accounts` |
| Registros bancarios originales | `transaction_source_records` |
| Movimientos procesados | `transactions` |
| Correcciones del usuario | `transaction_overrides` |
| Categorías | `categories` |
| Comercios | `merchants` |
| Presupuestos | `budgets` |
| Recurrentes | `recurrences` |
| Previsiones | `forecast_items` |
| Documentos | `documents` |
| Asociación documento/movimiento | `document_transaction_associations` |
| Ejecuciones de sincronización | `sync_runs` |
| Cursor incremental | `sync_cursors` |
| Auditoría | `audit_changes` |

La proyección efectiva del movimiento sigue siendo una responsabilidad única del dominio (`resolveEffectiveTransaction`); la base de datos conserva las tres capas y no introduce una segunda lógica financiera paralela.

## Persistencia reproducible

La migración `supabase/migrations/20260903_000001_financial_app_foundations.sql` deja preparada la estructura física completa de fundamentos:

- esquema aislado `financial_app`;
- claves primarias y foráneas;
- restricciones de tipos/estados;
- importes en céntimos dentro del rango entero seguro de JavaScript;
- unicidad normalizada de cuentas, categorías y aliases;
- jerarquía de categorías sin ciclos y con tipo coherente;
- registros bancarios protegidos contra `UPDATE` y `DELETE` también a nivel de base de datos;
- fingerprint y clave estable por fila de origen;
- índices para fechas, revisión, duplicados y sincronización;
- auditoría y cursor incremental;
- metadata fija `es-ES`, `EUR`, `Europe/Madrid`, versión `0.0.1` y objetivo `10.0.0`;
- acceso denegado por defecto a `anon`/`authenticated`; la apertura de acceso deberá hacerse de forma explícita cuando exista un modelo de autenticación validado.

Esta migración está versionada en Git pero **no se ha aplicado** sobre el Supabase compartido actual.

## Supabase

El proyecto Supabase actualmente conectado contiene tablas de otros desarrollos y un manifiesto previo de Financial App. No se ha reutilizado ninguna tabla ni se ha realizado ninguna modificación estructural durante esta reconstrucción.

La opción arquitectónica recomendada continúa siendo un **proyecto Supabase dedicado exclusivamente a Financial App**. Crear el proyecto puede consumir cuota o generar coste según el plan, por lo que la creación real requiere autorización explícita. Hasta entonces, la migración permanece preparada y comprobable en Git sin tocar infraestructura compartida.

## Responsive base

Breakpoints de referencia compartidos:

- 360 px: móvil pequeño
- 480 px: móvil grande
- 768 px: tablet vertical
- 1024 px: tablet horizontal
- 1280 px: portátil
- 1440 px: escritorio
- 1728 px: pantalla ancha

Los componentes pueden adaptarse de forma fluida entre estos puntos; no se usarán como fotografías aisladas.

## Siguiente bloque de Fase 1

1. Crear el Supabase dedicado cuando exista autorización explícita de cuota/coste.
2. Aplicar y verificar la migración reproducible en el proyecto nuevo.
3. Implementar los repositorios reales de cuentas y categorías contra esa persistencia.
4. Completar alta/edición/archivo/orden de cuentas y categorías sin borrados destructivos.
5. Verificar que sincronización y overrides sobreviven a actualizaciones repetidas.
6. Validar preview, responsive y regresión antes de cerrar Fase 1.
